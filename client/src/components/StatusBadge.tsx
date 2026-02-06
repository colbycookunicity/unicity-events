import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n";
import type { RegistrationStatus, SwagStatus, ReimbursementStatus, EventStatus } from "@shared/schema";

interface StatusBadgeProps {
  status: RegistrationStatus | SwagStatus | ReimbursementStatus | EventStatus | string;
  type?: "registration" | "swag" | "reimbursement" | "event";
}

export function StatusBadge({ status, type = "registration" }: StatusBadgeProps) {
  const { t } = useTranslation();

  const getStatusConfig = () => {
    switch (status) {
      // Registration statuses
      case "registered":
        return {
          label: t("registered"),
          className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
        };
      case "qualified":
        return {
          label: t("qualified"),
          className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
        };
      case "not_coming":
        return {
          label: t("notComing"),
          className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
        };
      case "checked_in":
        return {
          label: t("checkedIn"),
          className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
        };
      
      // Event statuses
      case "draft":
        return {
          label: t("draft"),
          className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
        };
      case "published":
        return {
          label: t("published"),
          className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
        };
      case "private":
        return {
          label: t("private"),
          className: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
        };
      case "registration_closed":
        return {
          label: "Registration Closed",
          className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
        };
      case "archived":
        return {
          label: t("archived"),
          className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500",
        };
      
      // Swag/Reimbursement statuses
      case "pending":
        return {
          label: t("pending"),
          className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
        };
      case "assigned":
        return {
          label: t("assigned"),
          className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
        };
      case "picked_up":
        return {
          label: t("swagPickedUp"),
          className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
        };
      case "processing":
        return {
          label: t("processing"),
          className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
        };
      case "completed":
        return {
          label: t("completed"),
          className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
        };
      
      default:
        return {
          label: status,
          className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
        };
    }
  };

  const config = getStatusConfig();

  return (
    <Badge variant="secondary" className={config.className} data-testid={`badge-status-${status}`}>
      {config.label}
    </Badge>
  );
}
