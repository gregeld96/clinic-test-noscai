import { client } from './client';

export const fetchAvailability = async (params: { service_id: number; doctor_ids?: number[]; from: string; to: string }) => {
    const { data } = await client.get('/availability', {
        params: {
            ...params,
            doctor_ids: params.doctor_ids?.join(',')
        }
    });
    return data;
};

export const fetchDoctorSchedule = async (doctorId: number, from: string, to: string) => {
    const { data } = await client.get(`/doctors/${doctorId}/schedule`, {
        params: { from, to }
    });
    return data;
};
