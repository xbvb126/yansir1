import type { ViewName } from "../../components/BottomNav";
import { desktopPrimaryItems } from "./portalNavigation";

export function ResponsivePrimaryNav({ activeView, currentUser, onNavigate }: {
  activeView: ViewName;
  currentUser: { id?: string; name?: string };
  onNavigate: (view: ViewName) => void;
}) {
  return (
    <header className="portal-primary-header">
      <button className="portal-brand-button" type="button" onClick={() => onNavigate("home")}>Yansir</button>
      <nav className="desktop-primary-nav" aria-label="主导航">
        {desktopPrimaryItems.map((item) => (
          <button key={item.view} type="button" aria-current={activeView === item.view ? "page" : undefined} onClick={() => onNavigate(item.view)}>
            {item.label}
          </button>
        ))}
      </nav>
      <button className="portal-account-button" type="button" onClick={() => onNavigate(currentUser.id ? "account" : "login")}>
        {currentUser.id ? "我的" : "登录 / 注册"}
      </button>
    </header>
  );
}
