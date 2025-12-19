import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Search, Download, Filter, MoreHorizontal, Mail, Edit, Trash2, X, User, Phone, MapPin, Plane, Shirt, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import type { Registration, Event } from "@shared/schema";

export default function AttendeesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [selectedAttendee, setSelectedAttendee] = useState<Registration | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleRowClick = (reg: Registration) => {
    setSelectedAttendee(reg);
    setDrawerOpen(true);
  };

  const { data: events } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const registrationsUrl = eventFilter === "all" 
    ? "/api/registrations" 
    : `/api/registrations?eventId=${eventFilter}`;
    
  const { data: registrations, isLoading } = useQuery<Registration[]>({
    queryKey: [registrationsUrl],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/registrations/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => 
        String(query.queryKey[0]).startsWith("/api/registrations")
      });
      toast({ title: t("success"), description: "Status updated successfully" });
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to update status", variant: "destructive" });
    },
  });

  const filteredRegistrations = registrations?.filter((reg) => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch =
      reg.firstName.toLowerCase().includes(searchLower) ||
      reg.lastName.toLowerCase().includes(searchLower) ||
      reg.email.toLowerCase().includes(searchLower) ||
      reg.unicityId?.toLowerCase().includes(searchLower);

    const matchesStatus = statusFilter === "all" || reg.status === statusFilter;
    const matchesEvent = eventFilter === "all" || reg.eventId === eventFilter;

    return matchesSearch && matchesStatus && matchesEvent;
  });

  const handleExportCSV = () => {
    if (!filteredRegistrations?.length) return;

    const headers = ["First Name", "Last Name", "Email", "Phone", "Unicity ID", "Status", "Shirt Size", "Registered At"];
    const csvContent = [
      headers.join(","),
      ...filteredRegistrations.map((reg) =>
        [
          reg.firstName,
          reg.lastName,
          reg.email,
          reg.phone || "",
          reg.unicityId || "",
          reg.status,
          reg.shirtSize || "",
          reg.registeredAt ? format(new Date(reg.registeredAt), "yyyy-MM-dd HH:mm") : "",
        ]
          .map((field) => `"${field}"`)
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendees-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({ title: t("success"), description: "CSV exported successfully" });
  };

  const columns = [
    {
      key: "name",
      header: "Name",
      render: (reg: Registration) => (
        <div>
          <div className="font-medium">{reg.firstName} {reg.lastName}</div>
          {reg.unicityId && (
            <div className="text-xs text-muted-foreground">ID: {reg.unicityId}</div>
          )}
        </div>
      ),
    },
    {
      key: "email",
      header: t("email"),
      render: (reg: Registration) => (
        <span className="text-muted-foreground">{reg.email}</span>
      ),
    },
    {
      key: "phone",
      header: t("phone"),
      render: (reg: Registration) => (
        <span className="text-muted-foreground">{reg.phone || "-"}</span>
      ),
    },
    {
      key: "status",
      header: t("status"),
      render: (reg: Registration) => <StatusBadge status={reg.status} />,
    },
    {
      key: "swagStatus",
      header: "Swag",
      render: (reg: Registration) => (
        <StatusBadge status={reg.swagStatus || "pending"} type="swag" />
      ),
    },
    {
      key: "registeredAt",
      header: "Registered",
      render: (reg: Registration) => (
        <span className="text-muted-foreground text-sm">
          {reg.registeredAt ? format(new Date(reg.registeredAt), "MMM d, yyyy") : "-"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-[50px]",
      render: (reg: Registration) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid={`button-actions-${reg.id}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem data-testid={`action-edit-${reg.id}`}>
              <Edit className="h-4 w-4 mr-2" />
              {t("edit")}
            </DropdownMenuItem>
            <DropdownMenuItem data-testid={`action-email-${reg.id}`}>
              <Mail className="h-4 w-4 mr-2" />
              Resend Confirmation
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => updateStatusMutation.mutate({ id: reg.id, status: "registered" })}
              data-testid={`action-mark-registered-${reg.id}`}
            >
              Mark as Registered
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => updateStatusMutation.mutate({ id: reg.id, status: "checked_in" })}
              data-testid={`action-mark-checked-in-${reg.id}`}
            >
              Mark as Checked In
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => updateStatusMutation.mutate({ id: reg.id, status: "not_coming" })}
              data-testid={`action-mark-not-coming-${reg.id}`}
            >
              Mark as Not Coming
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" data-testid={`action-delete-${reg.id}`}>
              <Trash2 className="h-4 w-4 mr-2" />
              {t("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("attendees")}</h1>
          <p className="text-muted-foreground">
            {filteredRegistrations?.length ?? 0} attendees
          </p>
        </div>
        <Button onClick={handleExportCSV} variant="outline" data-testid="button-export-csv">
          <Download className="h-4 w-4 mr-2" />
          {t("export")}
        </Button>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-attendees"
          />
        </div>
        <Select value={eventFilter} onValueChange={setEventFilter}>
          <SelectTrigger className="w-[200px]" data-testid="select-event-filter">
            <SelectValue placeholder="All Events" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Events</SelectItem>
            {events?.map((event) => (
              <SelectItem key={event.id} value={event.id}>
                {event.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="qualified">{t("qualified")}</SelectItem>
            <SelectItem value="registered">{t("registered")}</SelectItem>
            <SelectItem value="checked_in">{t("checkedIn")}</SelectItem>
            <SelectItem value="not_coming">{t("notComing")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={filteredRegistrations ?? []}
        isLoading={isLoading}
        getRowKey={(reg) => reg.id}
        emptyMessage="No attendees found"
        onRowClick={handleRowClick}
      />

      {/* Attendee Detail Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {selectedAttendee?.firstName} {selectedAttendee?.lastName}
            </SheetTitle>
            <SheetDescription>
              {selectedAttendee?.unicityId && `Distributor ID: ${selectedAttendee.unicityId}`}
            </SheetDescription>
          </SheetHeader>
          
          {selectedAttendee && (
            <div className="mt-6 space-y-6">
              {/* Status Section */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <StatusBadge status={selectedAttendee.status} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Swag</p>
                  <StatusBadge status={selectedAttendee.swagStatus || "pending"} type="swag" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Registered</p>
                  <span className="text-sm font-medium">
                    {selectedAttendee.registeredAt 
                      ? format(new Date(selectedAttendee.registeredAt), "MMM d, yyyy") 
                      : "-"}
                  </span>
                </div>
              </div>

              <Separator />

              {/* Contact Info */}
              <div className="space-y-3">
                <h4 className="font-medium">Contact Information</h4>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email</span>
                    <span>{selectedAttendee.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Phone</span>
                    <span>{selectedAttendee.phone || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gender</span>
                    <span className="capitalize">{selectedAttendee.gender || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date of Birth</span>
                    <span>
                      {selectedAttendee.dateOfBirth 
                        ? format(new Date(selectedAttendee.dateOfBirth), "MMM d, yyyy") 
                        : "-"}
                    </span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Passport Info */}
              <div className="space-y-3">
                <h4 className="font-medium">Passport Information</h4>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Passport Number</span>
                    <span>{selectedAttendee.passportNumber || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Country</span>
                    <span>{selectedAttendee.passportCountry || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Expiration</span>
                    <span>
                      {selectedAttendee.passportExpiration 
                        ? format(new Date(selectedAttendee.passportExpiration), "MMM d, yyyy") 
                        : "-"}
                    </span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Emergency Contact */}
              <div className="space-y-3">
                <h4 className="font-medium">Emergency Contact</h4>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name</span>
                    <span>{selectedAttendee.emergencyContact || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Phone</span>
                    <span>{selectedAttendee.emergencyContactPhone || "-"}</span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Apparel & Preferences */}
              <div className="space-y-3">
                <h4 className="font-medium">Apparel & Preferences</h4>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Shirt Size</span>
                    <span>{selectedAttendee.shirtSize || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pant Size</span>
                    <span>{selectedAttendee.pantSize || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Room Type</span>
                    <span>{selectedAttendee.roomType || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dietary Restrictions</span>
                    <span>
                      {selectedAttendee.dietaryRestrictions?.length 
                        ? selectedAttendee.dietaryRestrictions.join(", ") 
                        : "None"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ADA Accommodations</span>
                    <span>{selectedAttendee.adaAccommodations ? "Yes" : "No"}</span>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex gap-2 pt-4">
                <Select 
                  value={selectedAttendee.status} 
                  onValueChange={(status) => {
                    updateStatusMutation.mutate({ id: selectedAttendee.id, status });
                    setSelectedAttendee({ ...selectedAttendee, status });
                  }}
                >
                  <SelectTrigger className="flex-1" data-testid="select-status-drawer">
                    <SelectValue placeholder="Change Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qualified">Qualified</SelectItem>
                    <SelectItem value="registered">Registered</SelectItem>
                    <SelectItem value="checked_in">Checked In</SelectItem>
                    <SelectItem value="not_coming">Not Coming</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => setDrawerOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
