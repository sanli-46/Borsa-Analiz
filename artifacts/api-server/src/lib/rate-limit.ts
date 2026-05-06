import rateLimit from "express-rate-limit";

const WINDOW_MS = 60 * 1000;

export const heavyLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Çok fazla istek gönderildi. Lütfen bir dakika bekleyin." },
});

export const watchlistLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Çok fazla istek gönderildi. Lütfen bir dakika bekleyin." },
});

export const generalLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Çok fazla istek gönderildi. Lütfen bir dakika bekleyin." },
});
