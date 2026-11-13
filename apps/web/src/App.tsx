import { Navigate, Outlet, Route, Routes } from "react-router-dom";
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
import PublicLayout from "./pages/public/PublicLayout";
import Landing from "./pages/public/Landing";
import Ankauf from "./pages/public/Ankauf";
import Boerse from "./pages/public/Board";
import { Datenschutz, Impressum } from "./pages/public/Legal";

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

// Startseite: eingeloggt → Dashboard im internen Layout (mit Sidebar),
// sonst → öffentliches Landing.
function HomeRoute() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner label="Sitzung wird geprüft …" />
      </div>
    );
  }
  return user ? <Layout><Dashboard /></Layout> : <PublicLayout><Landing /></PublicLayout>;
}

function PublicShell() {
  return (
    <PublicLayout>
      <Outlet />
    </PublicLayout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<HomeRoute />} />
      <Route element={<PublicShell />}>
        <Route path="ankauf" element={<Ankauf />} />
        <Route path="boerse" element={<Boerse />} />
        <Route path="impressum" element={<Impressum />} />
        <Route path="datenschutz" element={<Datenschutz />} />
      </Route>
      <Route element={<Protected />}>
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
