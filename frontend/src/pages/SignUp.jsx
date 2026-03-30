import React, { useState } from "react";
import { useNavigate } from "react-router";
import { useAuthStore } from "../store/authStore";
import { toast } from "react-hot-toast";

const SignUp = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [isVerificationStep, setIsVerificationStep] = useState(false);
  const [otp, setOtp] = useState("");
  const { signup, verifyEmailSignup, resendVerification, isLoading, error } = useAuthStore();

  const handleSignUp = async (e) => {
    e.preventDefault();

    try {
      const data = await signup(username, email, password, adminCode);
      toast.success(data?.message || "Check your email for the verification code.");
      setIsVerificationStep(true);
    } catch (error) {
      toast.error(error.response?.data?.message || useAuthStore.getState().error || "Sign up failed");
    }
  };

  const handleResendCode = async () => {
    try {
      const data = await resendVerification(email);
      toast.success(data?.message || "New code sent");
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not resend");
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    try {
      await verifyEmailSignup(email, otp);
      navigate("/");
    } catch {}
  };

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat px-4 md:px-8 py-5"
      style={{
        backgroundImage:
          "linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url('/background_banner.jpg')",
      }}
    >
      <div className="max-w-[450px] w-full bg-black bg-opacity-75 rounded px-8 py-14 mx-auto mt-8">
        <h1 className="text-3xl font-medium text-white mb-7">Sign Up</h1>

        {isVerificationStep ? (
          <form onSubmit={handleVerify} className="flex flex-col space-y-4">
            <p className="text-gray-300 text-sm mb-2">
              We sent a verification code to {email}. If nothing arrives, check spam and ensure{" "}
              <code className="text-gray-400">EMAIL_USER</code> /{" "}
              <code className="text-gray-400">EMAIL_PASS</code> are set in <code className="text-gray-400">backend/.env</code>{" "}
              (Gmail app password).
            </p>
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="Enter 6-digit OTP"
              className="w-full h-[50px] bg-[#333] text-white rounded px-5 text-base"
            />
            {error && <p className="text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#e50914] text-white py-2 rounded text-base hover:opacity-90 cursor-pointer"
            >
              Verify & Log In
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={handleResendCode}
              className="w-full bg-transparent border border-gray-600 text-gray-300 py-2 rounded text-sm hover:bg-[#333] cursor-pointer"
            >
              Resend code
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignUp} className="flex flex-col space-y-4">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="John Doe"
              className="w-full h-[50px] bg-[#333] text-white rounded px-5 text-base"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="johndoe@gmail.com"
              className="w-full h-[50px] bg-[#333] text-white rounded px-5 text-base"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full h-[50px] bg-[#333] text-white rounded px-5 text-base"
            />
            <div className="space-y-2">
              <label htmlFor="admin-code" className="block text-sm text-gray-400">
                Admin secret code <span className="text-gray-600">(optional)</span>
              </label>
              <textarea
                id="admin-code"
                value={adminCode}
                onChange={(e) => setAdminCode(e.target.value)}
                placeholder="mysecretadmincode"
                rows={2}
                className="w-full min-h-[52px] bg-[#333] text-white rounded px-5 py-3 text-base border border-dashed border-gray-600 resize-y placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-[#e50914]"
              />
              <p className="text-xs text-gray-500 leading-relaxed">
                Leave empty for a normal account. To register as admin, enter the same secret as{" "}
                <code className="text-gray-400">ADMIN_SECRET</code> in the server{" "}
                <code className="text-gray-400">.env</code>, or use the default{" "}
                <code className="text-gray-300">mysecretadmincode</code>.
              </p>
            </div>

            {error && <p className="text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#e50914] text-white py-2 rounded text-base hover:opacity-90 cursor-pointer"
            >
              Sign Up
            </button>
          </form>
        )}

        <div className="mt-10 text-[#737373] text-sm">
          <p>
            Already have an account?
            <span
              onClick={() => navigate("/signin")}
              className="text-white font-medium cursor-pointer ml-2 hover:underline"
            >
              Sign In Now
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignUp;
