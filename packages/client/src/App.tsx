import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./stores/auth.js";
import { LoginPage } from "./pages/LoginPage.js";
import { RegisterPage } from "./pages/RegisterPage.js";
import { MainLayout } from "./layouts/MainLayout.js";

export function App() {
  const { user, loading } = useAuthStore();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/" /> : <RegisterPage />} />
      <Route path="/*" element={user ? <MainLayout /> : <Navigate to="/login" />} />
    </Routes>
  );
}
