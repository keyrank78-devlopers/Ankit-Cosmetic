const mongoose = require("mongoose");
const User = require("../models/User");
const Order = require("../models/Order");
const Customer = require("../models/Customer");
const Target = require("../models/Target");
const { downlineIds } = require("../utils/reporting");

const ACHIEVED = ["CONFIRM", "READY_TO_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERED"];

const currentMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);

const monthRange = (month) => {
    if (!/^\d{4}-\d{2}$/.test(month)) {
        const error = new Error("Choose a month");
        error.status = 400;
        throw error;
    }
    const start = new Date(`${month}-01T00:00:00+05:30`);
    const [year, mon] = month.split("-").map(Number);
    const next = mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, "0")}`;
    return { start, end: new Date(`${next}-01T00:00:00+05:30`) };
};

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const scopePeople = async (user) => {
    if (user.userType === "ADMIN") {
        return User.find({ userType: "EMPLOYEE" })
            .select("name employeeId role status reportingManager")
            .sort({ name: 1 })
            .limit(1000)
            .lean();
    }
    const below = await downlineIds(user._id);
    return User.find({ _id: { $in: [user._id, ...below] } })
        .select("name employeeId role status reportingManager")
        .sort({ name: 1 })
        .lean();
};

const achievedMatch = (ids, start, end) => ({
    createdBy: { $in: ids },
    status: { $in: ACHIEVED },
    $or: [
        { confirmedAt: { $gte: start, $lt: end } },
        { confirmedAt: null, placedAt: { $gte: start, $lt: end } },
    ],
});

const rollup = (id, ownMap, children, memo, trail) => {
    if (memo.has(id)) return memo.get(id);
    if (trail.has(id)) return ownMap.get(id) || { orders: 0, total: 0 };
    trail.add(id);
    const own = ownMap.get(id) || { orders: 0, total: 0 };
    const sum = { orders: own.orders, total: own.total };
    (children.get(id) || []).forEach((child) => {
        const next = rollup(child, ownMap, children, memo, trail);
        sum.orders += next.orders;
        sum.total += next.total;
    });
    memo.set(id, sum);
    return sum;
};

const getTargets = async (req, res, next) => {
    try {
        const month = String(req.query.month || currentMonth()).trim();
        const { start, end } = monthRange(month);
        const people = await scopePeople(req.user);
        const ids = people.map((person) => person._id);
        const [targets, achieved] = await Promise.all([
            ids.length ? Target.find({ user: { $in: ids }, month }).select("user amount").lean() : [],
            ids.length ? Order.aggregate([
                { $match: achievedMatch(ids, start, end) },
                { $group: { _id: "$createdBy", orders: { $sum: 1 }, total: { $sum: "$total" } } },
            ]) : [],
        ]);
        const targetMap = new Map(targets.map((item) => [String(item.user), item.amount]));
        const ownMap = new Map(achieved.map((item) => [String(item._id), { orders: item.orders, total: item.total || 0 }]));
        const known = new Set(people.map((person) => String(person._id)));
        const children = new Map();
        people.forEach((person) => {
            const parent = person.reportingManager ? String(person.reportingManager) : "";
            if (!parent || !known.has(parent)) return;
            if (!children.has(parent)) children.set(parent, []);
            children.get(parent).push(String(person._id));
        });
        const memo = new Map();
        const nameMap = new Map(people.map((person) => [String(person._id), person.name]));
        const rows = people.map((person) => {
            const id = String(person._id);
            const own = ownMap.get(id) || { orders: 0, total: 0 };
            const team = rollup(id, ownMap, children, memo, new Set());
            const target = targetMap.has(id) ? targetMap.get(id) : 0;
            const pending = Math.max(0, round2(target - team.total));
            const extra = Math.max(0, round2(team.total - target));
            return {
                _id: person._id,
                name: person.name,
                employeeId: person.employeeId || "",
                role: person.role || "",
                status: person.status || "ACTIVE",
                reportsTo: person.reportingManager && known.has(String(person.reportingManager)) ? nameMap.get(String(person.reportingManager)) : "",
                target,
                ownOrders: own.orders,
                ownAchieved: round2(own.total),
                achieved: round2(team.total),
                pending: target ? pending : 0,
                extra: target ? extra : 0,
            };
        });
        const selfId = String(req.user._id);
        res.status(200).json({
            success: true,
            month,
            canAssign: req.user.userType === "ADMIN" || people.some((person) => String(person._id) !== selfId),
            me: rows.find((row) => String(row._id) === selfId) || null,
            data: rows,
        });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        next(error);
    }
};

const setTarget = async (req, res, next) => {
    try {
        const month = String(req.body.month || "").trim();
        monthRange(month);
        if (!mongoose.Types.ObjectId.isValid(req.body.userId)) {
            return res.status(400).json({ success: false, message: "Choose a person" });
        }
        if (String(req.body.userId) === String(req.user._id)) {
            return res.status(400).json({ success: false, message: "Set a target for someone on your team" });
        }
        const person = await User.findOne({ _id: req.body.userId, userType: "EMPLOYEE" }).select("_id name");
        if (!person) return res.status(404).json({ success: false, message: "Employee not found" });
        if (req.user.userType !== "ADMIN") {
            const below = await downlineIds(req.user._id);
            if (!below.some((id) => String(id) === String(person._id))) {
                return res.status(403).json({ success: false, message: "You can set a target only for someone who reports to you" });
            }
        }
        const amount = round2(req.body.amount);
        if (!Number.isFinite(amount) || amount < 0 || amount > 1000000000) {
            return res.status(400).json({ success: false, message: "Enter a valid target amount" });
        }
        if (!amount) {
            await Target.deleteOne({ user: person._id, month });
            return res.status(200).json({ success: true, message: "Target removed" });
        }
        await Target.findOneAndUpdate(
            { user: person._id, month },
            { $set: { amount, setBy: req.user._id } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        res.status(200).json({ success: true, message: `Target saved for ${person.name}` });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        next(error);
    }
};

const getTargetOrders = async (req, res, next) => {
    try {
        const month = String(req.query.month || currentMonth()).trim();
        const { start, end } = monthRange(month);
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const focus = String(req.query.userId || "").trim();
        const search = String(req.query.search || "").trim();
        const people = await scopePeople(req.user);
        const allowed = new Set(people.map((person) => String(person._id)));
        if (focus && !allowed.has(focus)) {
            return res.status(403).json({ success: false, message: "That person is outside your team" });
        }
        const known = new Set(people.map((person) => String(person._id)));
        const children = new Map();
        people.forEach((person) => {
            const parent = person.reportingManager ? String(person.reportingManager) : "";
            if (!parent || !known.has(parent)) return;
            if (!children.has(parent)) children.set(parent, []);
            children.get(parent).push(String(person._id));
        });
        const collect = (id, out, seen) => {
            if (seen.has(id)) return;
            seen.add(id);
            out.push(id);
            (children.get(id) || []).forEach((child) => collect(child, out, seen));
        };
        const chosen = [];
        if (focus) collect(focus, chosen, new Set());
        const ids = (focus ? chosen : [...known]).map((id) => new mongoose.Types.ObjectId(id));
        const match = ids.length ? achievedMatch(ids, start, end) : { _id: null };
        if (search && ids.length) {
            const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const pattern = new RegExp(escaped, "i");
            const [customers, users] = await Promise.all([
                Customer.find({ $or: [{ retailerName: pattern }, { customerCode: pattern }] }).select("_id").limit(200).lean(),
                User.find({ _id: { $in: ids }, name: pattern }).select("_id").limit(200).lean(),
            ]);
            match.$and = [{
                $or: [
                    { orderCode: pattern },
                    { customer: { $in: customers.map((item) => item._id) } },
                    { createdBy: { $in: users.map((item) => item._id) } },
                ],
            }];
        }
        const [total, orders] = await Promise.all([
            Order.countDocuments(match),
            Order.find(match)
                .select("orderCode total status confirmedAt placedAt createdBy customer lines.name lines.quantity")
                .sort({ confirmedAt: -1, placedAt: -1, _id: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
        ]);
        const customerIds = [...new Set(orders.map((item) => String(item.customer)))];
        const userIds = [...new Set(orders.map((item) => String(item.createdBy)))];
        const [customers, users] = await Promise.all([
            customerIds.length ? Customer.find({ _id: { $in: customerIds } }).select("retailerName customerCode").lean() : [],
            userIds.length ? User.find({ _id: { $in: userIds } }).select("name employeeId").lean() : [],
        ]);
        const customerMap = new Map(customers.map((item) => [String(item._id), item]));
        const userMap = new Map(users.map((item) => [String(item._id), item]));
        res.status(200).json({
            success: true,
            data: orders.map((order) => ({
                _id: order._id,
                orderCode: order.orderCode || "",
                total: order.total || 0,
                status: order.status,
                at: order.confirmedAt || order.placedAt,
                customerName: customerMap.get(String(order.customer))?.retailerName || "",
                customerCode: customerMap.get(String(order.customer))?.customerCode || "",
                placedBy: userMap.get(String(order.createdBy))?.name || "",
                employeeId: userMap.get(String(order.createdBy))?.employeeId || "",
                items: (order.lines || []).map((line) => `${line.name} × ${line.quantity}`).join(", "),
            })),
            pagination: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) },
        });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        next(error);
    }
};

const targetSnapshot = async (user) => {
    const month = currentMonth();
    const { start, end } = monthRange(month);
    const people = await scopePeople(user);
    const ids = people.map((person) => person._id);
    const [targets, achieved] = await Promise.all([
        ids.length ? Target.find({ user: { $in: ids }, month }).select("user amount").lean() : [],
        ids.length ? Order.aggregate([
            { $match: achievedMatch(ids, start, end) },
            { $group: { _id: "$createdBy", orders: { $sum: 1 }, total: { $sum: "$total" } } },
        ]) : [],
    ]);
    const targetMap = new Map(targets.map((item) => [String(item.user), item.amount]));
    const ownMap = new Map(achieved.map((item) => [String(item._id), { orders: item.orders, total: item.total || 0 }]));
    const known = new Set(people.map((person) => String(person._id)));
    const children = new Map();
    people.forEach((person) => {
        const parent = person.reportingManager ? String(person.reportingManager) : "";
        if (!parent || !known.has(parent)) return;
        if (!children.has(parent)) children.set(parent, []);
        children.get(parent).push(String(person._id));
    });
    const memo = new Map();
    const rows = people.map((person) => {
        const id = String(person._id);
        const own = ownMap.get(id) || { orders: 0, total: 0 };
        const team = rollup(id, ownMap, children, memo, new Set());
        const target = targetMap.has(id) ? targetMap.get(id) : 0;
        return {
            name: person.name,
            target,
            ownAchieved: round2(own.total),
            achieved: round2(team.total),
            pending: target ? Math.max(0, round2(target - team.total)) : 0,
            extra: target ? Math.max(0, round2(team.total - target)) : 0,
        };
    });
    const withTarget = rows.filter((row) => row.target > 0);
    return {
        month,
        people: withTarget.length,
        targetAmount: round2(withTarget.reduce((sum, row) => sum + row.target, 0)),
        achieved: round2(rows.reduce((sum, row) => sum + row.ownAchieved, 0)),
        short: withTarget.filter((row) => row.pending > 0).length,
        over: withTarget.filter((row) => row.extra > 0).length,
        behind: withTarget.filter((row) => row.pending > 0).sort((a, b) => b.pending - a.pending).slice(0, 5),
    };
};

module.exports = { getTargets, setTarget, getTargetOrders, targetSnapshot };
