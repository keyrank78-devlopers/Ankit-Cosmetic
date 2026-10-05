const mongoose = require("mongoose");
const User = require("../models/User");
const Order = require("../models/Order");
const Customer = require("../models/Customer");

const loadUserProfile = async (userId, { employeesOnly = false } = {}) => {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        const error = new Error("Invalid profile");
        error.status = 400;
        throw error;
    }
    const filter = { _id: userId };
    if (employeesOnly) filter.userType = "EMPLOYEE";
    const person = await User.findOne(filter)
        .select("-password -refreshToken")
        .populate("department", "name")
        .populate("designation", "name")
        .populate("reportingManager", "name employeeId");
    if (!person) return null;

    const [team, orderRows, customers] = await Promise.all([
        User.find({ reportingManager: person._id, userType: "EMPLOYEE" })
            .select("name employeeId role status")
            .sort({ name: 1 })
            .limit(100)
            .lean(),
        Order.aggregate([
            { $match: { createdBy: person._id, status: { $ne: "DRAFT" } } },
            { $group: { _id: "$status", orders: { $sum: 1 }, total: { $sum: "$total" } } },
        ]),
        Customer.countDocuments({ createdBy: person._id }),
    ]);

    const statusKey = (status) => (status === "PLACED" || status === "PENDING_CONFIRM" || status === "PENDING" ? "PENDING" : status);
    const orders = { placed: 0, amount: 0, pending: 0, confirm: 0, ready: 0, out: 0, delivered: 0 };
    orderRows.forEach((row) => {
        orders.placed += row.orders;
        orders.amount += row.total || 0;
        const key = statusKey(row._id);
        if (key === "PENDING") orders.pending += row.orders;
        else if (key === "CONFIRM") orders.confirm += row.orders;
        else if (key === "READY_TO_DELIVERY") orders.ready += row.orders;
        else if (key === "OUT_FOR_DELIVERY") orders.out += row.orders;
        else if (key === "DELIVERED") orders.delivered += row.orders;
    });

    return { data: person, team, orders, customers };
};

module.exports = { loadUserProfile };
