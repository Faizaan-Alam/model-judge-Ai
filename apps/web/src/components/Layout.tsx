import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Button } from "./ui";

export function Layout() {
  const { user, logout } = useAuth();
  const link = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-lg text-sm font-medium ${
      isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
    }`;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-lg font-semibold text-brand-700">
              ModelJudge AI
            </Link>
            <nav className="flex gap-1">
              <NavLink to="/" end className={link}>
                Dashboard
              </NavLink>
              <NavLink to="/datasets" className={link}>
                Datasets
              </NavLink>
              <NavLink to="/experiments" className={link}>
                Experiments
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span>{user?.name}</span>
            <Button variant="ghost" onClick={logout}>
              Log out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
