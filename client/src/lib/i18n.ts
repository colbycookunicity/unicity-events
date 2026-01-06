import { create } from 'zustand';

export type Language = 'en' | 'es';

interface LanguageState {
  language: Language;
  setLanguage: (lang: Language) => void;
  hydrated: boolean;
}

const getInitialLanguage = (): Language => {
  if (typeof window !== 'undefined') {
    return (localStorage.getItem('language') as Language) || 'en';
  }
  return 'en';
};

export const useLanguage = create<LanguageState>((set) => ({
  language: 'en',
  hydrated: false,
  setLanguage: (lang) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('language', lang);
    }
    set({ language: lang });
  },
}));

if (typeof window !== 'undefined') {
  const savedLang = localStorage.getItem('language') as Language;
  if (savedLang) {
    useLanguage.setState({ language: savedLang, hydrated: true });
  } else {
    useLanguage.setState({ hydrated: true });
  }
}

type TranslationKey = keyof typeof translations.en;

const translations = {
  en: {
    // Navigation
    dashboard: "Dashboard",
    events: "Events",
    attendees: "Attendees",
    checkIn: "Check-in",
    reports: "Reports",
    settings: "Settings",
    
    // Auth
    signIn: "Sign In",
    signOut: "Sign Out",
    enterEmail: "Enter your email",
    enterCode: "Enter verification code",
    sendCode: "Send Code",
    verifyCode: "Verify Code",
    resendCode: "Resend Code",
    emailSent: "Verification code sent to your email",
    invalidCode: "Invalid verification code",
    
    // Events
    createEvent: "Create Event",
    editEvent: "Edit Event",
    eventName: "Event Name",
    eventDescription: "Description",
    eventLocation: "Location",
    startDate: "Start Date",
    endDate: "End Date",
    capacity: "Capacity",
    buyInPrice: "Buy-in Price",
    status: "Status",
    draft: "Draft",
    published: "Published",
    private: "Private",
    archived: "Archived",
    
    // Registration
    register: "Register",
    firstName: "First Name",
    lastName: "Last Name",
    email: "Email",
    phone: "Phone",
    shirtSize: "Shirt Size",
    dietaryRestrictions: "Dietary Restrictions",
    termsAndConditions: "Terms & Conditions",
    acceptTerms: "I accept the terms and conditions",
    submitRegistration: "Submit Registration",
    registrationSuccess: "Registration successful!",
    
    // Status
    registered: "Registered",
    qualified: "Qualified",
    notComing: "Not Coming",
    checkedIn: "Checked In",
    pending: "Pending",
    assigned: "Assigned",
    completed: "Completed",
    processing: "Processing",
    
    // Swag
    swagPickedUp: "Swag Picked Up",
    markSwagPickedUp: "Mark Swag Picked Up",
    
    // Flight Info
    flightInfo: "Flight Information",
    airline: "Airline",
    flightNumber: "Flight Number",
    departureCity: "Departure City",
    arrivalCity: "Arrival City",
    departureTime: "Departure Time",
    arrivalTime: "Arrival Time",
    addFlight: "Add Flight",
    
    // Reimbursement
    reimbursement: "Reimbursement",
    uploadReceipt: "Upload Receipt",
    markReimbursed: "Mark as Reimbursed",
    
    // Guest
    addGuest: "Add Guest",
    guestInfo: "Guest Information",
    payBuyIn: "Pay Buy-in",
    
    // Common
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    view: "View",
    search: "Search",
    filter: "Filter",
    export: "Export CSV",
    noResults: "No results found",
    loading: "Loading...",
    error: "An error occurred",
    success: "Success",
    actions: "Actions",
    
    // Dashboard
    totalEvents: "Total Events",
    totalRegistrations: "Total Registrations",
    upcomingEvents: "Upcoming Events",
    recentActivity: "Recent Activity",
    
    // User Dashboard
    myProfile: "My Profile",
    myEvents: "My Events",
    pendingTasks: "Pending Tasks",
    flightInfoMissing: "Flight information needed",
    receiptMissing: "Receipt upload needed",
    guestPaymentPending: "Guest payment pending",
  },
  es: {
    // Navigation
    dashboard: "Panel",
    events: "Eventos",
    attendees: "Asistentes",
    checkIn: "Registro",
    reports: "Informes",
    settings: "Configuracion",
    
    // Auth
    signIn: "Iniciar Sesion",
    signOut: "Cerrar Sesion",
    enterEmail: "Ingrese su correo electronico",
    enterCode: "Ingrese el codigo de verificacion",
    sendCode: "Enviar Codigo",
    verifyCode: "Verificar Codigo",
    resendCode: "Reenviar Codigo",
    emailSent: "Codigo de verificacion enviado a su correo",
    invalidCode: "Codigo de verificacion invalido",
    
    // Events
    createEvent: "Crear Evento",
    editEvent: "Editar Evento",
    eventName: "Nombre del Evento",
    eventDescription: "Descripcion",
    eventLocation: "Ubicacion",
    startDate: "Fecha de Inicio",
    endDate: "Fecha de Fin",
    capacity: "Capacidad",
    buyInPrice: "Precio de Inscripcion",
    status: "Estado",
    draft: "Borrador",
    published: "Publicado",
    private: "Privado",
    archived: "Archivado",
    
    // Registration
    register: "Registrarse",
    firstName: "Nombre",
    lastName: "Apellido",
    email: "Correo Electronico",
    phone: "Telefono",
    shirtSize: "Talla de Camiseta",
    dietaryRestrictions: "Restricciones Dieteticas",
    termsAndConditions: "Terminos y Condiciones",
    acceptTerms: "Acepto los terminos y condiciones",
    submitRegistration: "Enviar Registro",
    registrationSuccess: "Registro exitoso!",
    
    // Status
    registered: "Registrado",
    qualified: "Calificado",
    notComing: "No Asistira",
    checkedIn: "Registrado",
    pending: "Pendiente",
    assigned: "Asignado",
    completed: "Completado",
    processing: "Procesando",
    
    // Swag
    swagPickedUp: "Articulos Recogidos",
    markSwagPickedUp: "Marcar Articulos Recogidos",
    
    // Flight Info
    flightInfo: "Informacion de Vuelo",
    airline: "Aerolinea",
    flightNumber: "Numero de Vuelo",
    departureCity: "Ciudad de Salida",
    arrivalCity: "Ciudad de Llegada",
    departureTime: "Hora de Salida",
    arrivalTime: "Hora de Llegada",
    addFlight: "Agregar Vuelo",
    
    // Reimbursement
    reimbursement: "Reembolso",
    uploadReceipt: "Subir Recibo",
    markReimbursed: "Marcar como Reembolsado",
    
    // Guest
    addGuest: "Agregar Invitado",
    guestInfo: "Informacion del Invitado",
    payBuyIn: "Pagar Inscripcion",
    
    // Common
    save: "Guardar",
    cancel: "Cancelar",
    delete: "Eliminar",
    edit: "Editar",
    view: "Ver",
    search: "Buscar",
    filter: "Filtrar",
    export: "Exportar CSV",
    noResults: "Sin resultados",
    loading: "Cargando...",
    error: "Ocurrio un error",
    success: "Exito",
    actions: "Acciones",
    
    // Dashboard
    totalEvents: "Total de Eventos",
    totalRegistrations: "Total de Registros",
    upcomingEvents: "Proximos Eventos",
    recentActivity: "Actividad Reciente",
    
    // User Dashboard
    myProfile: "Mi Perfil",
    myEvents: "Mis Eventos",
    pendingTasks: "Tareas Pendientes",
    flightInfoMissing: "Informacion de vuelo requerida",
    receiptMissing: "Subir recibo requerido",
    guestPaymentPending: "Pago de invitado pendiente",
  },
} as const;

export function useTranslation() {
  const { language } = useLanguage();
  
  const t = (key: TranslationKey): string => {
    return translations[language][key] || translations.en[key] || key;
  };
  
  return { t, language };
}
