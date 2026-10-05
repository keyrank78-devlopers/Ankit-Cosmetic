import api from "./api";

const schemeService = {
  getSchemes: async (params = {}) => {
    const response = await api.get("/admin/schemes", { params });
    return response.data;
  },

  getSchemeById: async (id) => {
    const response = await api.get(`/admin/schemes/${id}`);
    return response.data;
  },

  createScheme: async (data) => {
    const response = await api.post("/admin/schemes", data);
    return response.data;
  },

  updateScheme: async (id, data) => {
    const response = await api.patch(`/admin/schemes/${id}`, data);
    return response.data;
  },

  deleteScheme: async (id) => {
    const response = await api.delete(`/admin/schemes/${id}`);
    return response.data;
  },
};

export default schemeService;
