import mongoose from "mongoose";

const userSchema = mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true },
  password: { type: String, required: true },
  watchlist: { type: Array, default: [] },
  profilePic: { type: String, default: "" },
  resetPasswordOTP: { type: String, default: null },
  resetPasswordExpires: { type: Date, default: null },
});

const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;
