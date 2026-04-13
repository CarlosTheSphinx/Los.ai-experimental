import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { useAuth } from "@/hooks/use-auth";
import DealDetailV1 from "./deal-detail-v1";
import DealDetailV2 from "./deal-detail-v2";
import BorrowerDealDetail from "./borrower-deal-detail";
import BrokerDealDetail from "./broker-deal-detail";

export default function DealDetailRouter() {
  const { isEnabled } = useFeatureFlags();
  const { user } = useAuth();

  if (user?.role === "borrower") {
    return <BorrowerDealDetail />;
  }

  if (user?.role === "broker") {
    return <BrokerDealDetail />;
  }

  return isEnabled("phase1.dealDetail") ? <DealDetailV2 /> : <DealDetailV1 />;
}
