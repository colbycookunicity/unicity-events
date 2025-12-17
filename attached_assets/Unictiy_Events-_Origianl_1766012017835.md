## Building an In-House Events Platform Tied Directly to Unicity Systems

Punta Cana \- Early June    
3 events/registrations \- Trents, RAV’s and Vasty’s (Eng & spanish)   
January qualifying? What is it (william)  
Buyin Payment BuyIns Square

We need Spanish easy to go\!

The intent of this effort is to explore building an internal events and registration platform that is natively integrated with the Unicity database and core systems, rather than operating as a standalone third-party tool.

 (need to know in the flow when a user changes or updates info with last modified date)/

The goal is to ensure events are treated as first-class Unicity data, not just marketing records.

What “Integrated with Unicity” Means in Practice

This platform would be designed from day one to support the following Unicity-specific needs:

1. Registration tied to Unicity IDs (Colby meets with Ashley)

   Get email or find the link  
   Fill out the form (need to get fields to fill out from Ashley).  
   Confirmation email goes out (iterable).  
   Buy in Process comes later \- Link from Confirmation  
   Swag? Sizes  
   Airfare: How does this happen, flight aware?  
   Updates?  
   Emails separate those that qualified but not registered vs registered  
   I”m not coming button they get off the list  
   Resend emails … easily without hassle the emails, confirmation or scheduled

   * Registrations linked directly to existing Unicity users (Distributor, Customer, Guest) ([Tyler Wall](mailto:tyler.wall@unicity.com))  
   * Support for invite-only and qualification-based access  
   * Clean handling of non-Unicity guests where needed

2. Check-in & attendance stored in Unicity

   * Check-in data written back to Unicity  
   * Clear record of who attended which event, when, and in what capacity  
   * Supports future reporting, recognition, and qualification logic

3. Ticket purchases when required

   * Ability to support paid events when needed  
   * Payments associated to the Unicity user and event  
   * Clear separation between free, invite-only, and paid experiences

4. Qualification & eligibility logic

   * Ability to call Unicity qualification logic (stored procedures / APIs) and pass a date range to these SP  
   * Gate registration or ticket access based on:

     * Rank  
     * Volume  
     * Prior event attendance  
     * Custom qualification rules

   * Store qualification results for audit and reporting

5. Iterable email integration [Mikele Jenkins](mailto:mikele.jenkins@unicity.com) 

   * Registration, reminders, and post-event emails sent through Iterable  
   * Event data available for segmentation and campaigns  
   * No duplicate email systems or manual list uploads

6. Badge printing & onsite support

   * Badge data sourced directly from registration records ([Ashley Milliken](mailto:ashley.milliken@unicity.com)I need to know more about how the check in, printers and physical badge printing work so I can make this happen).  
   * Support QR codes tied to Unicity IDs  
   * Enables fast check-in and accurate attendance tracking  
   * Edit names on the fly during check in. \[Colby research\]

7. Event participation reporting back to Unicity

   * Events attended become part of the user’s Unicity history  
   * Enables:

     * Recognition  
     * Compliance reporting  
     * Qualification logic  
     * Long-term engagement insights

---

Scope Philosophy

What we would focus on first (Phase 1):

* Event setup & admin tools  
* Event landing pages \+ registration  
* Unicity-linked attendee records  
* Check-in and attendance tracking  
* Iterable email triggers  
* Reporting back to Unicity systems

What we would not attempt initially:

* Full mobile event app  
* Advanced networking features  
* Complex onsite hardware workflows beyond badges  
* Replacing all Bizzabo features at once

---

Why This Matters

* Reduces reliance on manual exports and reconciliation  
* Ensures Events, Marketing, and IT are working from the same source of truth  
* Allows Unicity-specific workflows that third-party tools don’t support well  
* Gives us flexibility to evolve events as the business changes

This would start as a pilot alongside existing tools, shaped directly by Events team feedback, and only expanded if it proves valuable.

## **1\. Event Setup & Management (Admin)**

### **Core Event Configuration**

* Create events (single-day, multi-day, recurring)  
* Event status:

  * Draft  
  * Published  
  * Private / Invite-only

* Event metadata:

  * Event name  
  * Description  
  * Date(s) & time(s)  
  * Time zone handling  
  * Venue (physical, virtual, hybrid)

* Event capacity limits  
* Waitlists

**MVP:** ✅  
**Advanced:** capacity rules per ticket type

---

## **2\. Event Website / Landing Pages**

### **Event Pages**

* Custom event URL  
* Page builder (sections like hero, agenda, speakers, sponsors)  
* Mobile-responsive layouts  
* SEO metadata  
* Branding:

  * Logo  
  * Colors  
  * Fonts  
  * Multi-language support

### **Widgets & Embeds**

* Registration widget  
* Agenda widget  
* Speaker widget  
* Can embed on external sites

**MVP:** ✅

* Single event page \+ registration flow, spanish multilingual

 **Advanced:**

* Drag-and-drop builder, widgets, other multilingual

---

## **3\. Registration & Ticketing**

### **Registration Flow**

* Custom registration forms  
* Conditional fields (show/hide based on answers)

* Required vs optional fields  
* Custom questions (text, dropdown, checkbox)  
* Collect:

  * Name  
  * Email  
  * Company  
  * Role  
  * Dietary restrictions  
  * Custom business fields (Distributor ID, Unicity ID, etc.)  
  * Signed terms, privacy etc with IP address capture and date and time stamp

### **Ticket Types**

* Free tickets  
* Paid tickets  
* Multiple ticket tiers:

  **General Admission** – $99  
  **Early Bird** – $79 (limited quantity or time-based)  
  **VIP** – $249

* Discount codes / promo codes  
* Group registrations  
* RSVP vs ticketed events

### **Access Control**

* Invite-only registration  
* Approval-based registration  
* Unique registration links

**MVP:**  ✅ Free registration \+ custom form fields

**Advanced:**

* Paid tickets, approval workflows, group tickets

---

## 

## **4\. Payments & Billing**

### **Payment Processing**

* Credit card payments  
* Invoicing  
* Tax handling (VAT, sales tax)  
* Refunds  
* Promo codes

### **Financial Reporting**

* Revenue by event  
* Revenue by ticket type  
* Payment status tracking

**MVP:** ❌ (skip initially need to discuss with Payments team)  
**Advanced:** integrate Stripe later

---

## **5\. Attendee Management (CRM-Like)**

### **Attendee Profiles**

* Registration data  
* Ticket type  
* Attendance status  
* Check-in status  
* Engagement history  
* Custom attributes

### **Segmentation**

* Filter attendees by:

  * Ticket type  
  * Registration status  
  * Custom field values  
* Saved segments

### **Imports & Exports**

* CSV import  
* CSV export  
* Sync with CRM

**MVP:** ✅ Attendee list \+ export  
**Advanced:** segmentation, CRM sync

---

## **6\. Email & Communications**

### **Email Campaigns**

* Confirmation emails  
* Reminder emails  
* Post-event follow-ups  
* Custom email templates  
* Scheduled sends  
* Automated triggers:

  * On registration  
  * On check-in  
  * After event

### **Personalization**

* Merge fields  
* Dynamic content  
* Conditional blocks

**MVP:**  ✅ Confirmation email \+ reminders  
**Advanced:** full email builder

---

## 

## **7\. Agenda & Session Management**

### **Agenda Builder**

* Multi-track agendas  
* Sessions with:

  * Title  
  * Description  
  * Time  
  * Location/room

* Session capacity  
* Session registration (breakouts)

### **Speakers**

* Speaker profiles  
* Speaker photos  
* Speaker bios  
* Speaker-session linking

**MVP:**  ✅ Static agenda display  
**Advanced:** session signup \+ capacity limits

---

## **8\. Check-In & On-Site Experience**

### **Check-In Tools**

* QR code tickets  
* Manual check-in  
* Badge printing  
* Mobile check-in app

### **Attendance Tracking**

* Entry timestamps  
* Session attendance  
* No-show tracking

**MVP:**  ✅ Simple check-in (QR or list)  
**Advanced:** badge printing, session tracking

---

## **9\. Mobile Event App**

### **Attendee App Features**

* Agenda  
* Speaker bios  
* Attendee networking  
* Push notifications  
* In-app chat  
* Polls & Q\&A

**MVP:** ❌  
**Advanced:** more expensive & complex

---

## **10\. Networking & Engagement**

### **Engagement Tools**

* Attendee messaging  
* Matchmaking  
* Meeting scheduling  
* Live polls  
* Q\&A  
* Surveys

### **Gamification**

* Points  
* Leaderboards

* Engagement scores

**MVP:** ❌  
**Advanced:** post-registration add-on

---

## **11\. Virtual & Hybrid Events**

### **Streaming Integrations**

* Zoom  
* Vimeo  
* YouTube Live  
* Custom RTMP  
* Session-level streams

### **Access Control**

* Only registered attendees can watch  
* Session-specific access

**MVP:**  ✅ External Zoom links  
**Advanced:** embedded streaming \+ auth

---

## **12\. Analytics & Reporting**

### **Event Analytics**

* Registrations over time  
* Conversion rates  
* Traffic sources  
* Drop-off points  
* Attendance rate

### **Engagement Analytics**

* Email open rates  
* Session attendance  
* Poll participation

**MVP:**  ✅ Registration counts  
**Advanced:** funnel analytics

---

## **13\. Integrations & APIs**

### **Native Integrations**

* CRM (Salesforce, HubSpot)  
* Email (Marketo, Mailchimp)  
* Webinar tools  
* Payment processors

### **Webhooks & APIs**

* Registration created  
* Attendee updated  
* Ticket purchased  
* Check-in completed

**MVP:**  ✅ Webhooks for registration  
**Advanced:** full public API

---

## **14\. Permissions & Roles**

### **User Roles**

* Admin  
* Event manager  
  Event Manager over a market  
* Marketing user (cosmic)

* Read-only

### **Permissions**

* Event-level access  
* Feature-level access

**MVP:**  ✅ Admin \+ viewer  
**Advanced:** granular permissions

---

## **15\. Compliance & Security**

* GDPR compliance  
* Consent tracking  
* Data retention rules  
* Audit logs  
* SSO / SAML  
* Role-based access control

**MVP:**  ✅ Basic consent checkbox  
**Advanced:** enterprise compliance

---

## **What You Actually Need to Build FIRST (Recommended MVP)**

If your goal is **replace Bizzabo for Unicity-style events**, your **Phase 1 MVP** should be:

### **Phase 1 (Replace 80% of Bizzabo Value)**

1. Event landing page  
2. Custom registration forms  
3. Attendee database  
4. Email confirmations \+ reminders  
5. Admin attendee list \+ CSV export  
6. Webhooks → Replit backend  
7. Invite-only / approval registration

This alone eliminates **most Bizzabo costs**.

---

## **Suggested Architecture (High Level)**

* **Frontend:**

  * Next.js / React  
  * Builder.io (optional)

* **Backend:**

  * Node \+ Express (Replit)

* **Database:**

  * Postgres (Supabase / Neon)

* **Auth:**

  * Magic link email login

* **Email:**

  * SendGrid / Resend

* **Payments (later):**

  * Stripe

* **Analytics:**

  * PostHog / Mixpanel

