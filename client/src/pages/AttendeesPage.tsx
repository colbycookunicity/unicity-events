import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Search, Download, Filter, MoreHorizontal, Mail, Edit, Trash2, X, User, Phone, MapPin, Plane, Shirt, UtensilsCrossed, Save, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { Registration, Event, SwagAssignmentWithDetails } from "@shared/schema";

const DIETARY_OPTIONS = [
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "gluten_free", label: "Gluten Free" },
  { value: "dairy_free", label: "Dairy Free" },
  { value: "nut_allergy", label: "Nut Allergy" },
  { value: "shellfish_allergy", label: "Shellfish Allergy" },
  { value: "kosher", label: "Kosher" },
  { value: "halal", label: "Halal" },
];

export default function AttendeesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [selectedAttendee, setSelectedAttendee] = useState<Registration | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Registration>>({});

  const handleRowClick = (reg: Registration) => {
    setSelectedAttendee(reg);
    setEditForm(reg);
    setIsEditing(false);
    setDrawerOpen(true);
  };

  const handleEditToggle = () => {
    if (selectedAttendee) {
      setEditForm(selectedAttendee);
      setIsEditing(true);
    }
  };

  const handleFormChange = (field: keyof Registration, value: any) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const handleDietaryChange = (option: string, checked: boolean) => {
    const current = editForm.dietaryRestrictions || [];
    const updated = checked 
      ? [...current, option]
      : current.filter(d => d !== option);
    setEditForm(prev => ({ ...prev, dietaryRestrictions: updated }));
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

  const { data: swagAssignments } = useQuery<SwagAssignmentWithDetails[]>({
    queryKey: [`/api/registrations/${selectedAttendee?.id}/swag-assignments`],
    enabled: !!selectedAttendee && drawerOpen,
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

  const updateAttendeeMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      if (!selectedAttendee) throw new Error("No attendee selected");
      const response = await apiRequest("PATCH", `/api/registrations/${selectedAttendee.id}`, data);
      return response.json();
    },
    onSuccess: (updatedData) => {
      queryClient.invalidateQueries({ predicate: (query) => 
        String(query.queryKey[0]).startsWith("/api/registrations")
      });
      if (updatedData && typeof updatedData === 'object') {
        setSelectedAttendee(updatedData as Registration);
      }
      setIsEditing(false);
      toast({ title: t("success"), description: "Attendee updated successfully" });
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to update attendee", variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (!selectedAttendee) return;
    
    const existingDietary = selectedAttendee.dietaryRestrictions || [];
    const formDietary = editForm.dietaryRestrictions || [];
    const customRestrictions = existingDietary.filter(d => !DIETARY_OPTIONS.some(opt => opt.value === d));
    const mergedDietary = Array.from(new Set([...formDietary, ...customRestrictions]));
    
    const updateData = {
      firstName: editForm.firstName,
      lastName: editForm.lastName,
      email: editForm.email,
      phone: editForm.phone || null,
      gender: editForm.gender || null,
      dateOfBirth: editForm.dateOfBirth ? (typeof editForm.dateOfBirth === 'string' ? editForm.dateOfBirth : new Date(editForm.dateOfBirth).toISOString().split('T')[0]) : null,
      passportNumber: editForm.passportNumber || null,
      passportCountry: editForm.passportCountry || null,
      passportExpiration: editForm.passportExpiration ? (typeof editForm.passportExpiration === 'string' ? editForm.passportExpiration : new Date(editForm.passportExpiration).toISOString().split('T')[0]) : null,
      emergencyContact: editForm.emergencyContact || null,
      emergencyContactPhone: editForm.emergencyContactPhone || null,
      shirtSize: editForm.shirtSize || null,
      pantSize: editForm.pantSize || null,
      roomType: editForm.roomType || null,
      dietaryRestrictions: mergedDietary.length > 0 ? mergedDietary : null,
      adaAccommodations: editForm.adaAccommodations || false,
      status: editForm.status,
    };
    
    updateAttendeeMutation.mutate(updateData);
  };

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
      key: "lastModified",
      header: "Last Modified",
      render: (reg: Registration) => (
        <span className="text-muted-foreground text-sm">
          {reg.lastModified ? format(new Date(reg.lastModified), "MMM d, yyyy h:mm a") : "-"}
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
      <Sheet open={drawerOpen} onOpenChange={(open) => {
        setDrawerOpen(open);
        if (!open) setIsEditing(false);
      }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <div className="flex items-center justify-between gap-4">
              <SheetTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                {selectedAttendee?.firstName} {selectedAttendee?.lastName}
              </SheetTitle>
              {!isEditing && (
                <Button variant="outline" size="sm" onClick={handleEditToggle} data-testid="button-edit-attendee">
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              )}
            </div>
            <SheetDescription>
              {selectedAttendee?.unicityId && `Distributor ID: ${selectedAttendee.unicityId}`}
            </SheetDescription>
          </SheetHeader>
          
          {selectedAttendee && !isEditing && (
            <div className="mt-6 space-y-6">
              {/* Status Section */}
              <div className="flex flex-wrap items-center gap-4">
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
                <div>
                  <p className="text-sm text-muted-foreground">Last Modified</p>
                  <span className="text-sm font-medium">
                    {selectedAttendee.lastModified 
                      ? format(new Date(selectedAttendee.lastModified), "MMM d, yyyy h:mm a") 
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

              <Separator />

              {/* Swag Assignments */}
              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <Shirt className="h-4 w-4" />
                  Swag Assignments
                </h4>
                {swagAssignments && swagAssignments.length > 0 ? (
                  <div className="space-y-2">
                    {swagAssignments.map((assignment) => (
                      <div 
                        key={assignment.id} 
                        className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/50"
                        data-testid={`swag-assignment-${assignment.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{assignment.swagItem?.name}</span>
                          {assignment.size && (
                            <span className="text-muted-foreground">({assignment.size})</span>
                          )}
                        </div>
                        <span className={`text-xs px-2 py-1 rounded ${
                          assignment.status === 'received' 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                        }`}>
                          {assignment.status === 'received' ? 'Received' : 'Assigned'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No swag assigned yet</p>
                )}
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

          {/* Edit Mode Form */}
          {selectedAttendee && isEditing && (
            <div className="mt-6 space-y-6">
              {/* Status */}
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editForm.status || ""} onValueChange={(v) => handleFormChange("status", v)}>
                  <SelectTrigger data-testid="edit-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qualified">Qualified</SelectItem>
                    <SelectItem value="registered">Registered</SelectItem>
                    <SelectItem value="checked_in">Checked In</SelectItem>
                    <SelectItem value="not_coming">Not Coming</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Personal Information */}
              <div className="space-y-4">
                <h4 className="font-medium">Personal Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>First Name</Label>
                    <Input 
                      value={editForm.firstName || ""} 
                      onChange={(e) => handleFormChange("firstName", e.target.value)}
                      data-testid="edit-firstName"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name</Label>
                    <Input 
                      value={editForm.lastName || ""} 
                      onChange={(e) => handleFormChange("lastName", e.target.value)}
                      data-testid="edit-lastName"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input 
                    type="email"
                    value={editForm.email || ""} 
                    onChange={(e) => handleFormChange("email", e.target.value)}
                    data-testid="edit-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input 
                    value={editForm.phone || ""} 
                    onChange={(e) => handleFormChange("phone", e.target.value)}
                    data-testid="edit-phone"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <Select value={editForm.gender || ""} onValueChange={(v) => handleFormChange("gender", v)}>
                    <SelectTrigger data-testid="edit-gender">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Date of Birth</Label>
                  <Input 
                    type="date"
                    value={editForm.dateOfBirth ? format(new Date(editForm.dateOfBirth), "yyyy-MM-dd") : ""} 
                    onChange={(e) => handleFormChange("dateOfBirth", e.target.value)}
                    data-testid="edit-dateOfBirth"
                  />
                </div>
              </div>

              <Separator />

              {/* Passport Information */}
              <div className="space-y-4">
                <h4 className="font-medium">Passport Information</h4>
                <div className="space-y-2">
                  <Label>Passport Number</Label>
                  <Input 
                    value={editForm.passportNumber || ""} 
                    onChange={(e) => handleFormChange("passportNumber", e.target.value)}
                    data-testid="edit-passportNumber"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Passport Country</Label>
                  <Input 
                    value={editForm.passportCountry || ""} 
                    onChange={(e) => handleFormChange("passportCountry", e.target.value)}
                    data-testid="edit-passportCountry"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Passport Expiration</Label>
                  <Input 
                    type="date"
                    value={editForm.passportExpiration ? format(new Date(editForm.passportExpiration), "yyyy-MM-dd") : ""} 
                    onChange={(e) => handleFormChange("passportExpiration", e.target.value)}
                    data-testid="edit-passportExpiration"
                  />
                </div>
              </div>

              <Separator />

              {/* Emergency Contact */}
              <div className="space-y-4">
                <h4 className="font-medium">Emergency Contact</h4>
                <div className="space-y-2">
                  <Label>Contact Name</Label>
                  <Input 
                    value={editForm.emergencyContact || ""} 
                    onChange={(e) => handleFormChange("emergencyContact", e.target.value)}
                    data-testid="edit-emergencyContact"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Contact Phone</Label>
                  <Input 
                    value={editForm.emergencyContactPhone || ""} 
                    onChange={(e) => handleFormChange("emergencyContactPhone", e.target.value)}
                    data-testid="edit-emergencyContactPhone"
                  />
                </div>
              </div>

              <Separator />

              {/* Apparel & Preferences */}
              <div className="space-y-4">
                <h4 className="font-medium">Apparel & Preferences</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Shirt Size</Label>
                    <Select value={editForm.shirtSize || ""} onValueChange={(v) => handleFormChange("shirtSize", v)}>
                      <SelectTrigger data-testid="edit-shirtSize">
                        <SelectValue placeholder="Select size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="XS">XS</SelectItem>
                        <SelectItem value="S">S</SelectItem>
                        <SelectItem value="M">M</SelectItem>
                        <SelectItem value="L">L</SelectItem>
                        <SelectItem value="XL">XL</SelectItem>
                        <SelectItem value="2XL">2XL</SelectItem>
                        <SelectItem value="3XL">3XL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Pant Size</Label>
                    <Input 
                      value={editForm.pantSize || ""} 
                      onChange={(e) => handleFormChange("pantSize", e.target.value)}
                      data-testid="edit-pantSize"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Room Type</Label>
                  <Select value={editForm.roomType || ""} onValueChange={(v) => handleFormChange("roomType", v)}>
                    <SelectTrigger data-testid="edit-roomType">
                      <SelectValue placeholder="Select room type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Single</SelectItem>
                      <SelectItem value="double">Double</SelectItem>
                      <SelectItem value="suite">Suite</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Dietary Restrictions</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {DIETARY_OPTIONS.map((option) => (
                      <div key={option.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`edit-diet-${option.value}`}
                          checked={editForm.dietaryRestrictions?.includes(option.value) || false}
                          onCheckedChange={(checked) => handleDietaryChange(option.value, !!checked)}
                          data-testid={`edit-diet-${option.value}`}
                        />
                        <Label htmlFor={`edit-diet-${option.value}`} className="text-sm font-normal">
                          {option.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-ada"
                    checked={editForm.adaAccommodations || false}
                    onCheckedChange={(checked) => handleFormChange("adaAccommodations", !!checked)}
                    data-testid="edit-adaAccommodations"
                  />
                  <Label htmlFor="edit-ada" className="text-sm font-normal">
                    ADA Accommodations Required
                  </Label>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4 sticky bottom-0 bg-background py-4 border-t">
                <Button 
                  onClick={handleSave} 
                  disabled={updateAttendeeMutation.isPending}
                  className="flex-1"
                  data-testid="button-save-attendee"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {updateAttendeeMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setIsEditing(false)}
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
