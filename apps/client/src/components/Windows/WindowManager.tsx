import { useWindowManagerStore } from "../../store/windowManager.store";
import AuctionHouseWindow from "./AuctionHouseWindow";
import MailboxWindow from "./MailboxWindow";

const WINDOW_REGISTRY: Record<string, React.ComponentType<{ buildingId: string; onClose: () => void }>> = {
  auction_house: AuctionHouseWindow,
  mailbox: MailboxWindow,
};

export default function WindowManager() {
  const windows = useWindowManagerStore((s) => s.windows);
  const closeWindow = useWindowManagerStore((s) => s.closeWindow);

  return (
    <>
      {windows.map((win) => {
        const Component = WINDOW_REGISTRY[win.buildingType];
        if (!Component) return null;
        return (
          <Component
            key={win.id}
            buildingId={win.buildingId}
            onClose={() => closeWindow(win.id)}
          />
        );
      })}
    </>
  );
}
