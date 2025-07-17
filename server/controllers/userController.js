import Booking from "../models/Booking.js";
import { clerkClient } from "@clerk/express";
import Movie from "../models/Movie.js";


// API Controller Function to Get User Booking
export const getUserBookings = async (req, res) => {
    try {
        const user = req.auth().userId;
        
        const bookings = await Booking.find({user}).populate({
            path: "show",
            populate: {path: "movie"}
        }).sort({ createdAt: -1 })
        res.json({ success: true, bookings});
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: error.message });
    }
}

// API Controller Function to Update Favourite Movie in Clerk User Metadata
export const updateFavourite = async (req, res) => {
    try {
        const { movieId } = req.body;
        const userId = req.auth().userId;

        const user = await clerkClient.users.getUser(userId);

        if (!user.privateMetadata.favorites) {
            user.privateMetadata.favorites = []
        }

        if (!user.privateMetadata.favorites.includes(movieId)) {
            user.privateMetadata.favorites.push(movieId)
        } 
        else {
            user.privateMetadata.favorites = user.privateMetadata.favorites.filter(item => item != movieId);
        }

        await clerkClient.users.updateUserMetadata(userId, { privateMetadata: user.privateMetadata });

        res.json({ success: true, message: "Favourite movies updated."});


    } catch (error) {
        console.error(error);
        res.json({ success: false, message: error.message });
    }
}

export const getFavorites = async(req, res) => {
    try {

        const { userId }= req.auth();

        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const user = await clerkClient.users.getUser(userId);
        const favorites = user.privateMetadata.favorites;

        // Getting movies from database
        const movies = await Movie.find({_id: {$in: favorites}})

        res.json({ success: true, movies})
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: error.message });
    }
}