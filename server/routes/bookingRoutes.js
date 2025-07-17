import express from 'express';
import { cancelBooking, createBooking, getOccupiedSeats } from '../controllers/bookingController.js';


const bookingRouter = express.Router();

bookingRouter.post('/create', createBooking);
bookingRouter.get('/seats/:showId', getOccupiedSeats);
bookingRouter.delete('/cancel/:bookingId', cancelBooking);

export default bookingRouter;
