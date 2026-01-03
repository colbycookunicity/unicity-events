import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Trash2, Printer, Wifi, WifiOff, TestTube2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Printer as PrinterType, Event } from "@shared/schema";

const printerFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  location: z.string().optional(),
  ipAddress: z.string().min(7, "IP address is required").regex(
    /^(\d{1,3}\.){3}\d{1,3}$/,
    "Please enter a valid IP address"
  ),
  port: z.coerce.number().min(1).max(65535).default(9100),
});

type PrinterFormData = z.infer<typeof printerFormSchema>;

export default function PrintersPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState<PrinterType | null>(null);
  const [deletingPrinter, setDeletingPrinter] = useState<PrinterType | null>(null);
  const [bridgeUrl, setBridgeUrl] = useState<string>(
    localStorage.getItem("print-bridge-url") || ""
  );
  const [bridgeStatus, setBridgeStatus] = useState<"unknown" | "connected" | "disconnected">("unknown");

  const { data: events, isLoading: eventsLoading } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const { data: printers, isLoading: printersLoading, refetch: refetchPrinters } = useQuery<PrinterType[]>({
    queryKey: ["/api/events", selectedEventId, "printers"],
    enabled: !!selectedEventId,
  });

  const form = useForm<PrinterFormData>({
    resolver: zodResolver(printerFormSchema),
    defaultValues: {
      name: "",
      location: "",
      ipAddress: "",
      port: 9100,
    },
  });

  const createPrinterMutation = useMutation({
    mutationFn: async (data: PrinterFormData) => {
      return apiRequest("POST", `/api/events/${selectedEventId}/printers`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", selectedEventId, "printers"] });
      setIsAddDialogOpen(false);
      form.reset();
      toast({
        title: "Printer added",
        description: "The printer has been added successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add printer",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updatePrinterMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<PrinterFormData> }) => {
      return apiRequest("PATCH", `/api/printers/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", selectedEventId, "printers"] });
      setEditingPrinter(null);
      form.reset();
      toast({
        title: "Printer updated",
        description: "The printer has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update printer",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deletePrinterMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/printers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", selectedEventId, "printers"] });
      setDeletingPrinter(null);
      toast({
        title: "Printer deleted",
        description: "The printer has been removed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete printer",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: PrinterFormData) => {
    if (editingPrinter) {
      updatePrinterMutation.mutate({ id: editingPrinter.id, data });
    } else {
      createPrinterMutation.mutate(data);
    }
  };

  const handleEdit = (printer: PrinterType) => {
    setEditingPrinter(printer);
    form.reset({
      name: printer.name,
      location: printer.location || "",
      ipAddress: printer.ipAddress,
      port: printer.port || 9100,
    });
  };

  const handleSaveBridgeUrl = () => {
    localStorage.setItem("print-bridge-url", bridgeUrl);
    toast({
      title: "Bridge URL saved",
      description: "The Print Bridge URL has been saved.",
    });
    checkBridgeStatus();
  };

  const checkBridgeStatus = async () => {
    if (!bridgeUrl) {
      setBridgeStatus("unknown");
      return;
    }
    try {
      const response = await fetch(`${bridgeUrl}/health`, { method: "GET" });
      if (response.ok) {
        setBridgeStatus("connected");
      } else {
        setBridgeStatus("disconnected");
      }
    } catch {
      setBridgeStatus("disconnected");
    }
  };

  const handleTestPrint = async (printer: PrinterType) => {
    if (!bridgeUrl) {
      toast({
        title: "No bridge configured",
        description: "Please configure the Print Bridge URL first.",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(`${bridgeUrl}/printers/${printer.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ipAddress: printer.ipAddress,
          port: printer.port || 9100,
        }),
      });

      if (response.ok) {
        toast({
          title: "Test print sent",
          description: `Test label sent to ${printer.name}`,
        });
      } else {
        const error = await response.json();
        toast({
          title: "Test print failed",
          description: error.error || "Failed to send test print",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Connection failed",
        description: "Could not connect to Print Bridge",
        variant: "destructive",
      });
    }
  };

  const isLoading = eventsLoading || printersLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
            Printers
          </h1>
          <p className="text-muted-foreground">
            Manage badge printers for event check-in
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wifi className="h-5 w-5" />
            Print Bridge Connection
          </CardTitle>
          <CardDescription>
            Configure the URL of your local Print Bridge service
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Input
              value={bridgeUrl}
              onChange={(e) => setBridgeUrl(e.target.value)}
              placeholder="http://192.168.1.100:3100"
              className="max-w-md"
              data-testid="input-bridge-url"
            />
            <Button onClick={handleSaveBridgeUrl} data-testid="button-save-bridge">
              Save
            </Button>
            <Button variant="outline" onClick={checkBridgeStatus} data-testid="button-check-bridge">
              Check Status
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {bridgeStatus === "connected" && (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                <Wifi className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            )}
            {bridgeStatus === "disconnected" && (
              <Badge variant="destructive">
                <WifiOff className="h-3 w-3 mr-1" />
                Disconnected
              </Badge>
            )}
            {bridgeStatus === "unknown" && (
              <Badge variant="secondary">
                Status Unknown
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Printer className="h-5 w-5" />
                Event Printers
              </CardTitle>
              <CardDescription>
                Manage printers assigned to each event
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <Select
              value={selectedEventId}
              onValueChange={setSelectedEventId}
            >
              <SelectTrigger className="w-[300px]" data-testid="select-event">
                <SelectValue placeholder="Select an event" />
              </SelectTrigger>
              <SelectContent>
                {events?.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedEventId && (
              <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-printer">
                <Plus className="h-4 w-4 mr-2" />
                Add Printer
              </Button>
            )}
          </div>

          {selectedEventId && printers && printers.length > 0 && (
            <div className="border rounded-md">
              <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-4 p-3 border-b bg-muted/50 text-sm font-medium">
                <div>Name</div>
                <div>Location</div>
                <div>IP Address</div>
                <div>Actions</div>
              </div>
              {printers.map((printer) => (
                <div
                  key={printer.id}
                  className="grid grid-cols-[1fr_1fr_1fr_auto] gap-4 p-3 border-b last:border-b-0 items-center"
                  data-testid={`row-printer-${printer.id}`}
                >
                  <div className="font-medium">{printer.name}</div>
                  <div className="text-muted-foreground">{printer.location || "—"}</div>
                  <div className="font-mono text-sm">{printer.ipAddress}:{printer.port || 9100}</div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleTestPrint(printer)}
                      title="Test Print"
                      data-testid={`button-test-${printer.id}`}
                    >
                      <TestTube2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleEdit(printer)}
                      data-testid={`button-edit-${printer.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeletingPrinter(printer)}
                      data-testid={`button-delete-${printer.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedEventId && printers && printers.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No printers configured for this event.
              <br />
              Click "Add Printer" to get started.
            </div>
          )}

          {!selectedEventId && (
            <div className="text-center py-8 text-muted-foreground">
              Select an event to manage its printers.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={isAddDialogOpen || !!editingPrinter}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddDialogOpen(false);
            setEditingPrinter(null);
            form.reset();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingPrinter ? "Edit Printer" : "Add Printer"}
            </DialogTitle>
            <DialogDescription>
              {editingPrinter
                ? "Update the printer details."
                : "Add a new Zebra printer to this event."}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Lobby Printer"
                        {...field}
                        data-testid="input-printer-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location (optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Main Entrance"
                        {...field}
                        data-testid="input-printer-location"
                      />
                    </FormControl>
                    <FormDescription>
                      Where is this printer physically located?
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ipAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>IP Address</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="192.168.1.100"
                        {...field}
                        data-testid="input-printer-ip"
                      />
                    </FormControl>
                    <FormDescription>
                      The IP address of the Zebra printer on the venue network.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="port"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Port</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="9100"
                        {...field}
                        data-testid="input-printer-port"
                      />
                    </FormControl>
                    <FormDescription>
                      Default ZPL port is 9100.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsAddDialogOpen(false);
                    setEditingPrinter(null);
                    form.reset();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createPrinterMutation.isPending || updatePrinterMutation.isPending}
                  data-testid="button-save-printer"
                >
                  {createPrinterMutation.isPending || updatePrinterMutation.isPending
                    ? "Saving..."
                    : editingPrinter
                    ? "Update"
                    : "Add Printer"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deletingPrinter}
        onOpenChange={(open) => !open && setDeletingPrinter(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Printer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingPrinter?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingPrinter && deletePrinterMutation.mutate(deletingPrinter.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
