import api from "./api";

const giftService = {
  getGifts: async (params = {}) => {
    const response = await api.get("/admin/gifts", { params });
    return response.data;
  },

  getGiftById: async (id) => {
    const response = await api.get(`/admin/gifts/${id}`);
    return response.data;
  },

  createGift: async (data) => {
    const response = await api.post("/admin/gifts", data);
    return response.data;
  },

  updateGift: async (id, data) => {
    const response = await api.patch(`/admin/gifts/${id}`, data);
    return response.data;
  },

  updateStock: async (id, stock) => {
    const response = await api.patch(`/admin/gifts/${id}/stock`, { stock });
    return response.data;
  },

  deleteGift: async (id) => {
    const response = await api.delete(`/admin/gifts/${id}`);
    return response.data;
  },
};

export default giftService;
