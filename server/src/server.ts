import { createApp } from "./app.js";

const PORT = 4000;
const app = createApp();

app.listen(PORT, () => {
    console.log(`play basketball API is running on http://localhost:${PORT}`);
});