export interface Tenant {
    id: number;
    name: string;
}

export interface Doctor {
    id: number;
    tenant_id: number;
    name: string;
}

export interface Service {
    id: number;
    tenant_id: number;
    name: string;
    duration_min: number;
    buffer_before_min: number;
    buffer_after_min: number;
}

export interface Appointment {
    id: number;
    tenant_id: number;
    doctor_id: number;
    patient_id?: number;
    service_id: number;
    room_id: number;
    starts_at: string; // ISO string
    ends_at: string;   // ISO string
}

export interface CreateAppointmentRequest {
    doctor_id: number;
    patient_id: number;
    service_id: number;
    room_id: number;
    device_ids?: number[];
    starts_at: string;
}

export interface AvailabilitySearchRequest {
    service_id: number;
    doctor_ids?: number[];
    from: string;
    to: string;
    limit: number;
}

export interface TimeSlot {
    doctor_id: number;
    doctor_name: string;
    room_id: number;
    room_name: string;
    device_ids: number[];
    start: string;
    end: string;
}

export interface ScheduleItem {
    type: 'available' | 'appointment' | 'break' | 'closed';
    start: string;
    end: string;
    doctor_id: number;
    doctor_name: string;
    room_id?: number;
    room_name?: string;
    appointment_id?: number;
    service_id?: number;
    service_name?: string;
    patient_id?: number;
    patient_name?: string;
}

// API Response Types
export interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export interface ApiErrorDetails {
    code?: string;
    details?: any;
}

export interface ApiResponse<T = any> {
    success: boolean;
    message: string;
    data?: T;
    error?: ApiErrorDetails;
    pagination?: PaginationMeta;
}
