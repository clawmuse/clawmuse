import { ChevronLeft } from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";
import { foregroundIconColorMapping } from "@/components/ui/icon-button-chrome";

const ThemedChevronLeft = withUnistyles(ChevronLeft);

/** The 30pt canvas draws a 10.6 × 18.1pt chevron inside the 44pt navigation circle. */
export function CompactBackIcon() {
  return <ThemedChevronLeft size={30} uniProps={foregroundIconColorMapping} />;
}
