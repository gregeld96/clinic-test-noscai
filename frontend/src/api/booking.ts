import { client } from './client';

export const fetchServices = async () => {
    const { data } = await client.get('/services');
    return data;
};

export const fetchDoctors = async () => {
    const { data } = await client.get('/doctors');
    return data;
};

export const createBooking = async (bookingData: any) => {
    const { data } = await client.post('/appointments', bookingData);
    return data;
};
