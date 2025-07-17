import Show from "../models/Show.js"
import Booking from "../models/Booking.js";
import Stripe from 'stripe';
import { inngest } from "../inngest/index.js";

// Function to check availability of selected seats for a movie
const checkSeatsAvailability = async (showId, selectedSeats) => {
    try {
        const showData = await Show.findById(showId);
        if (!showData) return false;

        const occupiedSeats = showData.occupiedSeats;

        const isAnySeatTaken = selectedSeats.some(seat => occupiedSeats[seat]);

        return !isAnySeatTaken;
    } catch (error) {
        console.error(error.message);
        return false;
    }
}

export const createBooking = async(req, res) => {
    try {
        const { userId } = req.auth();
        const { showId, selectedSeats } = req.body;
        const { origin } = req.headers;

        // Check if the seat is available for the selected show
        const isAvailable = await checkSeatsAvailability(showId, selectedSeats);

        if (!isAvailable) {
            return res.json({ success: false, message: "Selected Seats are not available."})
        }

        // Get the show details
        const showData = await Show.findById(showId).populate('movie');

        // Create a new booking
        const booking = await Booking.create({
            user: userId,
            show: showId,
            amount: showData.showPrice * selectedSeats.length,
            bookedSeats: selectedSeats
        })

        selectedSeats.map((seat) => {
            showData.occupiedSeats[seat] = userId;
        })

        showData.markModified('occupiedSeats');

        await showData.save();

        // Stripe Gateway Initialize
        const stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY);

        // Creating line item to for Stripe
        const line_items = [{
            price_data: {
                currency: 'usd',
                product_data: {
                    name: showData.movie.title
                },
                unit_amount: Math.floor(booking.amount) * 100
            },
            quantity: 1
        }]

        const session = await stripeInstance.checkout.sessions.create({
            success_url: `${origin}/loading/my-bookings`,
            cancel_url: `${origin}/my-bookings`,
            line_items: line_items,
            mode: 'payment', 
            metadata: {
                bookingId: booking._id.toString()
            },
            expires_at: Math.floor(Date.now() / 1000) + 30 * 60,  // Expires in 30 minutes
        })

        booking.paymentLink = session.url;
        await booking.save();

        // Run Inngest Function to check payment status after 10 minutes
        await inngest.send({
            name: "app/checkpayment",
            data: {
                bookingId: booking._id.toString()
            }
        })

        res.json({ success: true, url: session.url});

    } catch (error) {
        console.error(error.message);
        res.json({ success: false, message: error.message });
    }
}


export const getOccupiedSeats = async (req, res) => {
    try {
        
        const { showId } = req.params;
        const showData = await Show.findById(showId);

        const occupiedSeats = Object.keys(showData.occupiedSeats)

        res.json({success: true, occupiedSeats});

    } catch (error) {
        console.error(error.message);
        res.json({ success: false, message: error.message });
    }
}

export const cancelBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        const show = await Show.findById(booking.show);
        if (!show) {
            return res.status(404).json({ success: false, message: "Show not found" });
        }

        const currentTime = new Date();
        const showTime = new Date(show.showDateTime);
        const timeDiffInMs = showTime - currentTime;
        const threeHoursInMs = 3 * 60 * 60 * 1000;

        if (timeDiffInMs <= threeHoursInMs) {
            return res.status(400).json({
                success: false,
                message: "Cancellations are only allowed at least 3 hours before showtime.",
            });
        }

        booking.bookedSeats.forEach(seat => {
            delete show.occupiedSeats[seat];
        });

        show.markModified('occupiedSeats');
        await show.save();
        
        await booking.deleteOne();

        res.json({ success: true, message: "Booking cancelled and seats released." });

    } catch (error) {
        console.error(error.message);
        res.status(500).json({ success: false, message: error.message });
    }
}
