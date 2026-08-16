import axios from 'axios';

import { auth } from './firebase';

const apiInstance = axios.create({
	baseURL: 'http://localhost:8000',
	timeout: 15000,
	headers: {
		'Content-Type': 'application/json',
		Accept: 'application/json',
	},
});

apiInstance.interceptors.response.use(
	(response) => response,
	(error) => {
		const message = error?.response?.data?.detail || error.message || 'Network request failed';
		console.error(message, error);
		return Promise.reject(error);
	}
);

apiInstance.interceptors.request.use(async (config) => {
	const user = auth.currentUser;
	if (user) {
		const token = await user.getIdToken();
		config.headers = config.headers || {};
		config.headers.Authorization = `Bearer ${token}`;
	}
	return config;
});

export default apiInstance;
