import api from "./api";

const BASE_URL = "/admin/customers";

const customerService = {
  getCustomers: async (params = {}) => {
    const response = await api.get(BASE_URL, { params });
    return response.data;
  },

  getCustomerById: async (id) => {
    const response = await api.get(`${BASE_URL}/${id}`);
    return response.data;
  },

  createCustomer: async (data) => {
    const response = await api.post(BASE_URL, data);
    return response.data;
  },

  downloadSample: async () => {
    const response = await api.get(`${BASE_URL}/import-sample`, { responseType: "blob" });
    return response;
  },

  importCustomers: async (file) => {
    const body = new FormData();
    body.append("file", file);
    const response = await api.post(`${BASE_URL}/import`, body);
    return response.data;
  },

  updateCustomer: async (id, data) => {
    const response = await api.put(`${BASE_URL}/${id}`, data);
    return response.data;
  },

  deleteCustomer: async (id) => {
    const response = await api.delete(`${BASE_URL}/${id}`);
    return response.data;
  },

  getAssignees: async (params = {}) => {
    const response = await api.get(`${BASE_URL}/assignees`, { params });
    return response.data;
  },

  assignLead: async (id, userId) => {
    const response = await api.put(`${BASE_URL}/${id}/assign`, { userId });
    return response.data;
  },

  getFollowUps: async (id, params = {}) => {
    const response = await api.get(`${BASE_URL}/${id}/follow-ups`, { params });
    return response.data;
  },

  addFollowUp: async (id, data) => {
    const response = await api.post(`${BASE_URL}/${id}/follow-ups`, data);
    return response.data;
  },
};

export default customerService;
