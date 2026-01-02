import axios from 'axios';

const API_URL = 'http://localhost:3000/api';
const TENANT_ID = '1';

export const client = axios.create({
    baseURL: API_URL,
    headers: {
        'X-Tenant-Id': TENANT_ID,
    },
});
