import express from "express";
import path from "path";
import { connectToDB } from "./config/db.js";
import dotenv from "dotenv";
import User from "./models/user.model.js";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import cors from "cors";
import nodemailer from "nodemailer";

dotenv.config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const app = express();

const PORT = process.env.PORT || 5000;

// Middlewares

app.use(express.json());
app.use(cookieParser());
app.use(cors({origin: process.env.CLIENT_URL, credentials: true}))

// Middleware to protect routes
const protectRoute = async (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: "Not authorized" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};

// --- AUTH ROUTES ---

app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetPasswordOTP = otp;
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 mins
    await user.save();

    // Send real email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your AIFlix Password Reset OTP",
      text: `Your OTP for password reset is: ${otp}. It expires in 10 minutes.`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`[OTP sent to ${email}]`);
    
    res.status(200).json({ message: "OTP sent to your email!" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  try {
    const user = await User.findOne({ 
      email, 
      resetPasswordOTP: otp,
      resetPasswordExpires: { $gt: Date.now() }
    });
    if (!user) return res.status(400).json({ message: "Invalid or expired OTP" });

    res.status(200).json({ message: "OTP verified. You can now reset your password." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/reset-password", async (req, res) => {
  const { email, otp, newPassword } = req.body;
  try {
    const user = await User.findOne({ 
      email, 
      resetPasswordOTP: otp,
      resetPasswordExpires: { $gt: Date.now() }
    });
    if (!user) return res.status(400).json({ message: "Invalid or expired OTP" });

    user.password = await bcryptjs.hash(newPassword, 10);
    user.resetPasswordOTP = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// --- USER & WATCHLIST ROUTES ---

app.put("/api/update-profile", protectRoute, async (req, res) => {
  const { username, email, password, profilePic } = req.body;
  try {
    const user = await User.findById(req.user._id);
    if (username) user.username = username;
    if (email) user.email = email;
    if (profilePic) user.profilePic = profilePic;
    if (password) user.password = await bcryptjs.hash(password, 10);

    await user.save();
    res.status(200).json({ user, message: "Profile updated successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/watchlist", protectRoute, async (req, res) => {
  res.status(200).json({ watchlist: req.user.watchlist });
});

app.post("/api/watchlist/add", protectRoute, async (req, res) => {
  const { movie } = req.body;
  try {
    const user = await User.findById(req.user._id);
    if (user.watchlist.some(m => m.id === movie.id)) {
      return res.status(400).json({ message: "Movie already in watchlist" });
    }
    user.watchlist.push(movie);
    await user.save();
    res.status(200).json({ watchlist: user.watchlist, message: "Added to watchlist" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete("/api/watchlist/remove/:id", protectRoute, async (req, res) => {
  const { id } = req.params;
  try {
    const user = await User.findById(req.user._id);
    user.watchlist = user.watchlist.filter(m => m.id !== parseInt(id) && m.id !== id);
    await user.save();
    res.status(200).json({ watchlist: user.watchlist, message: "Removed from watchlist" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/", (req, res) => {
  res.send("Subscribe To My Channel!");
});

app.post("/api/signup", async (req, res) => {
  const { username, email, password } = req.body;

  try {
    if (!username || !email || !password) {
      throw new Error("All fields are required!");
    }

    const emailExists = await User.findOne({ email });

    if (emailExists) {
      return res.status(400).json({ message: "User already exists." });
    }

    const usernameExists = await User.findOne({ username });

    if (usernameExists) {
      return res
        .status(400)
        .json({ message: "Username is taken, try another name." });
    }

    const hashedPassword = await bcryptjs.hash(password, 10);

    const userDoc = await User.create({
      username,
      email,
      password: hashedPassword,
    });

    // JWT

    if (userDoc) {
      // jwt.sign(payload, secret, options)
      const token = jwt.sign({ id: userDoc._id }, process.env.JWT_SECRET, {
        expiresIn: "7d",
      });

      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });
    }

    return res
      .status(200)
      .json({ user: userDoc, message: "User created successfully." });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const userDoc = await User.findOne({ username });
    if (!userDoc) {
      return res.status(400).json({ message: "Invalid credentials." });
    }

    const isPasswordValid = await bcryptjs.compareSync(
      password,
      userDoc.password
    );
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Invalid credentials." });
    }

    // JWT
    if (userDoc) {
      // jwt.sign(payload, secret, options)
      const token = jwt.sign({ id: userDoc._id }, process.env.JWT_SECRET, {
        expiresIn: "7d",
      });

      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });
    }

    return res
      .status(200)
      .json({ user: userDoc, message: "Logged in successfully." });
  } catch (error) {
    console.log("Error Logging in: ", error.message);
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/fetch-user", async (req, res) => {
  const { token } = req.cookies;

  if (!token) {
    return res.status(401).json({ message: "No token provided." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const userDoc = await User.findById(decoded.id).select("-password");

    if (!userDoc) {
      return res.status(400).json({ message: "No user found." });
    }

    res.status(200).json({ user: userDoc });
  } catch (error) {
    console.log("Error in fetching user: ", error.message);
    return res.status(400).json({ message: error.message });
  }
});

app.post("/api/logout", async (req, res) => {
  res.clearCookie("token");
  res.status(200).json({ message: "Logged out successfully" });
});

const __dirname = path.resolve();

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "/frontend/dist")));

  app.get("*", (req, res) => {
    res.sendFile(path.resolve(__dirname, "frontend", "dist", "index.html"));
  });
}

app.listen(PORT, () => {
  connectToDB();
  console.log(`Server is running on http://localhost:${PORT}`);
});
