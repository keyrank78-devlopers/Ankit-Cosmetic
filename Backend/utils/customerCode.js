const Counter = require("../models/Counter");

const financialYear = (date = new Date()) => {
    const year = date.getFullYear();
    const start = date.getMonth() >= 3 ? year : year - 1;
    return `${start}/${String(start + 1).slice(-2)}`;
};

const nextCustomerCode = async () => {
    const year = financialYear();
    const counter = await Counter.findOneAndUpdate(
        { id: `CUS-${year}` },
        { $inc: { seq: 1 } },
        { returnDocument: "after", upsert: true }
    );
    return `cus${year}-${String(counter.seq).padStart(4, "0")}`;
};

const nextOrderCode = async (date = new Date()) => {
    const year = financialYear(date);
    const counter = await Counter.findOneAndUpdate(
        { id: `ORD-${year}` },
        { $inc: { seq: 1 } },
        { returnDocument: "after", upsert: true }
    );
    return `Order ${year}-${String(counter.seq).padStart(4, "0")}`;
};

module.exports = { financialYear, nextCustomerCode, nextOrderCode };
