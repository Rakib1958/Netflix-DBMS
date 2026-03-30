import { Navigate, Route, Routes } from "react-router";
import Navbar from "./components/Navbar";
import Homepage from "./pages/Homepage";
import Moviepage from "./pages/Moviepage";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import { Toaster } from "react-hot-toast";
import { useAuthStore } from "./store/authStore";
import { useEffect } from "react";
import AIRecommendations from "./pages/AIRecommendations";
import HelpCenter from "./pages/HelpCenter";
import Profile from "./pages/Profile";
import Watchlist from "./pages/Watchlist";
import ForgotPassword from "./pages/ForgotPassword";
import AdminDashboard from "./pages/AdminDashboard";
import Browse from "./pages/Browse";
import SearchResults from "./pages/SearchResults";

const App = () => {
  const { user, fetchUser, fetchingUser } = useAuthStore();

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  if (fetchingUser) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <p className="text-[#e50914] text-xl font-bold">Loading...</p>
      </div>
    );
  }

  return (
    <div className="bg-black min-h-screen">
      <Toaster />
      <Navbar />

      <Routes>
        <Route path={"/"} element={<Homepage />} />
        <Route path={"/browse/:tab"} element={<Browse />} />
        <Route path={"/movie/:id"} element={<Moviepage />} />
        <Route path={"/search"} element={<SearchResults />} />
        <Route path={"/signin"} element={!user ? <SignIn /> : <Navigate to="/" />} />
        <Route path={"/signup"} element={!user ? <SignUp /> : <Navigate to="/" />} />
        <Route path={"/forgot-password"} element={!user ? <ForgotPassword /> : <Navigate to="/" />} />
        <Route path={"/ai-recommendations"} element={user ? <AIRecommendations /> : <Navigate to="/signin" />} />
        <Route path={"/help-center"} element={user ? <HelpCenter /> : <Navigate to="/signin" />} />
        <Route path={"/profile"} element={user ? <Profile /> : <Navigate to="/signin" />} />
        <Route path={"/watchlist"} element={user ? <Watchlist /> : <Navigate to="/signin" />} />
        <Route path={"/admin"} element={user?.role === 'admin' ? <AdminDashboard /> : <Navigate to="/" />} />
      </Routes>
    </div>
  );
};

export default App;
