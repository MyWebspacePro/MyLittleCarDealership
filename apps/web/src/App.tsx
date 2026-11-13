import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { Spinner } from "./components/ui";
import { useAuth } from "./lib/auth";
import Dashboard from "./pages/Dashboard";
import Auswertungen from "./pages/Auswertungen";
import FahrzeugDetail from "./pages/FahrzeugDetail";
import Fahrzeuge from "./pages/Fahrzeuge";
import Kalender from "./pages/Kalender";
import Kunden from "./pages/Kunden";
import Login from "./pages/Login";
import Posteingang from "./pages/Posteingang";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import Users from "./pages/Users";

function Protected() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner label="Sitzung wird geprüft …" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Layout />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected />}>
        <Route index element={<Dashboard />} />
        <Route path="posteingang" element={<Posteingang />} />
        <Route path="fahrzeuge" element={<Fahrzeuge />} />
        <Route path="fahrzeuge/:id" element={<FahrzeugDetail />} />
        <Route path="kunden" element={<Kunden />} />
        <Route path="kalender" element={<Kalender />} />
        <Route path="auswertungen" element={<Auswertungen />} />
        <Route path="users" element={<Users />} />
        <Route path="settings" element={<Settings />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}