import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import router from "./routes";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";

// @ts-ignore - connect-pg-simple doesn't have perfect types
import connectPgSimple from "connect-pg-simple";

const PgSession = connectPgSimple(session);

const app: Express = express();

// Trust the first proxy (Apache/Nginx) so X-Forwarded-* headers are respected.
// Required for correct IP logging and secure-cookie detection behind a reverse proxy.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use((_req, res, next) => {
  res.setTimeout(30_000, () => {
    if (!res.headersSent) {
      res.status(503).json({ error: "Request timeout" });
    }
  });
  next();
});

export const sessionMiddleware = session({
  store: new PgSession({
    pool,
    tableName: "session",
    createTableIfMissing: true,
  }),
  secret: (() => {
    const s = process.env.SESSION_SECRET;
    if (!s) throw new Error("SESSION_SECRET environment variable is required but not set.");
    return s;
  })(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    // Set COOKIE_SECURE=true in .env only after HTTPS is fully configured.
    // Leave unset (or false) when running on plain HTTP.
    secure: process.env.COOKIE_SECURE === "true",
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    sameSite: "lax",
  },
});

app.use(sessionMiddleware);
app.use("/api", router);

export default app;
