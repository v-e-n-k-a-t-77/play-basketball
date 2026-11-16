import express from "express";

const app= express();
const PORT= 4000;

app.get("/health", (_req,res) => {
    res.json({ status: "ok"});
});

app.listen(PORT, () => {
    console.log(`Play Baketball API running on http://localhost:${PORT}`);
});