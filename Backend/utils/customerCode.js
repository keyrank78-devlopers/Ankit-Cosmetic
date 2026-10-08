const Counter = require("../models/Counter");

const financialYear = (date = new Date()) => {
    const year = date.getFullYear();
    const start = date.getMonth() >= 3 ? year : year - 1;
    return `${start}/${String(start + 1).slice(-2)}`;
};

const nextCustomerCode = async () => {
    const [code] = await reserveCustomerCodes(1);
    return code;
};

const reserveCustomerCodes = async (count) => {
    const total = Math.max(parseInt(count, 10) || 0, 0);
    if (!total) return [];
    const year = financialYear();
    const counter = await Counter.findOneAndUpdate(
        { id: `CUS-${year}` },
        { $inc: { seq: total } },
        { returnDocument: "after", upsert: true }
    );
    const start = counter.seq - total + 1;
    const codes = new Array(total);
    for (let index = 0; index < total; index += 1) {
        codes[index] = `cus${year}-${String(start + index).padStart(4, "0")}`;
    }
    return codes;
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

module.exports = { financialYear, nextCustomerCode, reserveCustomerCodes, nextOrderCode };
