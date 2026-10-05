import axios from "axios";
import Cookies from "js-cookie";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true, // required to send/receive cookies if applicable
});

// Add a request interceptor to attach the Authorization token
api.interceptors.request.use(
  (config) => {
    const token = Cookies.get("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor to handle global errors (e.g., 401 Unauthorized)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Token is expired or invalid, clear auth state
      Cookies.remove("token");
      Cookies.remove("user");
      // Could also trigger a global event or redirect to login here
      window.location.href = "/";
    }
    return Promise.reject(error);
  }
);

export default api;
