import React, { useState } from "react";
import { useAuthStore } from "../store/authStore";
import { toast } from "react-hot-toast";
import { Mail, Key, Lock, ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [step, setStep] = useState(1); // 1: Email, 2: OTP & Reset
  const { forgotPassword, resetPassword, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    try {
      const res = await forgotPassword(email);
      toast.success(res?.message || "OTP sent to your email!");
      setStep(2);
    } catch (error) {
      toast.error(error.response?.data?.message || "User not found");
    }
  };

  const handleResendResetOtp = async () => {
    try {
      const res = await forgotPassword(email);
      toast.success(res?.message || "A new code was sent to your email.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to resend");
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    try {
      await resetPassword(email, otp, newPassword);
      toast.success("Password reset successfully!");
      navigate("/signin");
    } catch (error) {
      toast.error(error.response?.data?.message || "Invalid OTP");
    }
  };

  return (
    <div className="min-h-screen bg-[#141414] flex items-center justify-center p-6 bg-cover bg-center" style={{ backgroundImage: "url('https://assets.nflxext.com/ffe/siteui/vlv3/f841d4c7-10e1-40af-bcae-07a3f8dc141a/f6ed3b94-9df4-4ef1-9a42-6a445ec68661/US-en-20220502-popsignuptwelve-perspective_alpha_website_medium.jpg')" }}>
       <div className="absolute inset-0 bg-black bg-opacity-60"></div>
       
       <div className="relative z-10 w-full max-w-md bg-black bg-opacity-80 p-8 rounded-lg">
          <Link to="/signin" className="text-gray-400 hover:text-white flex items-center gap-2 mb-6 transition">
            <ArrowLeft className="w-4 h-4" /> Back to Sign In
          </Link>

          <h1 className="text-3xl font-bold text-white mb-2">Reset Password</h1>
          <p className="text-gray-400 mb-8">
            {step === 1 ? "Enter your email to receive a 6-digit OTP." : "Enter the OTP and your new password."}
          </p>

          {step === 1 ? (
            <form onSubmit={handleRequestOtp} className="space-y-6">
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
                <input
                  type="email"
                  required
                  placeholder="Email Address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#333333] pl-12 pr-4 py-3 rounded text-white outline-none focus:ring-2 focus:ring-[#e50914]"
                />
              </div>
              <button disabled={isLoading} className="w-full bg-[#e50914] text-white font-bold py-3 rounded hover:bg-[#b20710] transition disabled:opacity-50">
                {isLoading ? "Sending..." : "Send OTP"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-6">
              <div className="relative">
                <Key className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
                <input
                  type="text"
                  required
                  placeholder="6-Digit OTP"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full bg-[#333333] pl-12 pr-4 py-3 rounded text-white outline-none focus:ring-2 focus:ring-[#e50914]"
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
                <input
                  type="password"
                  required
                  placeholder="New Password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-[#333333] pl-12 pr-4 py-3 rounded text-white outline-none focus:ring-2 focus:ring-[#e50914]"
                />
              </div>
              <button disabled={isLoading} className="w-full bg-[#e50914] text-white font-bold py-3 rounded hover:bg-[#b20710] transition disabled:opacity-50">
                {isLoading ? "Reset Password..." : "Reset Password"}
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={handleResendResetOtp}
                className="w-full text-sm text-gray-400 hover:text-white underline"
              >
                Resend OTP
              </button>
            </form>
          )}
       </div>
    </div>
  );
};

export default ForgotPassword;
