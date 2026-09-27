# Sentinel Client

> **Overnight Intelligence Platform** - Mission Control Dashboard

Sentinel Client is the web interface for the Sentinel Industrial Predictive Maintenance platform. It provides real-time monitoring, AI-powered investigation, and actionable insights for industrial equipment health.

## Overview

The Sentinel Client is a modern, responsive web application built with **Next.js 16** and **React 19** that enables industrial site operators to:

- Monitor machine health in real-time
- Review AI-generated investigations and root cause analysis
- Manage incidents and briefings
- Configure sensors, API keys, and webhooks
- Access comprehensive documentation and analytics

## Features

### Core Capabilities

| Feature | Description |
|---------|-------------|
| **Real-time Dashboard** | Live overview of all machines, sensors, and active incidents |
| **AI Investigation (Argus)** | Autonomous agent that correlates evidence and proposes root causes |
| **Morning Briefing** | Automated overnight intelligence reports ready by shift handoff |
| **Incident Management** | Track, review, and resolve machine health incidents |
| **Sensor Monitoring** | Real-time sensor data visualization and health status |
| **Predictive Analytics** | Machine learning-powered predictions for RUL, anomalies, and fault probabilities |

### User Workflow

```
Login
  ↓
Overview Dashboard
  ↓
Review Live Events
  ↓
Investigate Anomalies (Argus)
  ↓
Approve Morning Briefing
  ↓
Take Action
```

## Getting Started

### Prerequisites

- Node.js 18+ (recommended: 20 LTS)
- npm 9+ or bun 1.0+
- Docker (for full stack deployment)

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd Sentinel/client
   ```

2. **Install dependencies:**
   ```bash
   # Using npm
   npm install
   
   # Using bun (recommended for development)
   bun install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Run development server:**
   ```bash
   npm run dev
   # or
   bun run dev
   ```

5. **Open in browser:**
   ```
   http://localhost:3000
   ```

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API endpoint | No | `http://localhost:8000` |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | Support contact email | No | `support@sentinel.io` |

For production deployments, the `API_UPSTREAM_URL` is configured via Docker environment variables (see [Dockerfile](#docker)).

## Project Structure

```
sentinel/client/
├── public/                  # Static assets, icons, images
├── src/
│   ├── app/                # Next.js App Router pages
│   │   ├── (auth)/         # Authentication pages (login, register, etc.)
│   │   ├── briefing/       # Morning briefing pages
│   │   ├── dashboard/      # Main dashboard
│   │   ├── dev/           # Development/testing pages
│   │   ├── docs/          # Documentation
│   │   ├── incident/      # Incident details
│   │   ├── incidents/     # Incidents list
│   │   ├── investigate/   # Investigation interface
│   │   ├── overview/      # Overview page
│   │   ├── profile/       # User profile
│   │   ├── sensors/       # Sensor management
│   │   ├── settings/      # Configuration pages
│   │   │   ├── api-key/   # API key management
│   │   │   ├── general/   # General settings
│   │   │   └── webhooks/  # Webhook configuration
│   │   ├── layout.js      # Root layout
│   │   └── page.js        # Landing page
│   │
│   ├── components/        # Reusable React components
│   │   ├── agent/         # Argus agent components
│   │   ├── briefing/      # Briefing components
│   │   ├── events/        # Event display components
│   │   ├── layout/        # Layout components
│   │   ├── shared/        # Shared utility components
│   │   └── ui/            # UI primitives (buttons, cards, etc.)
│   │
│   ├── hooks/             # Custom React hooks
│   ├── lib/               # Utility functions and constants
│   ├── services/          # API service clients
│   ├── styles/            # Global styles
│   │   └── globals.css    # Global CSS with CSS variables
│   └── utils/             # Utility functions
│
├── styles/                # Additional style configurations
│   └── tailwind.config.js  # Tailwind CSS configuration
├── components.json        # shadcn/ui configuration
├── jsconfig.json          # JavaScript project configuration
├── next.config.mjs        # Next.js configuration
├── package.json           # Project dependencies and scripts
├── postcss.config.mjs     # PostCSS configuration
├── tailwind.config.js     # Tailwind CSS v4 configuration
└── Dockerfile             # Docker build configuration
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server on port 3000 |
| `npm run dev:stable` | Development with increased memory limit |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

## Technology Stack

### Framework & Runtime
- **Next.js 16.2.12** - React framework with App Router
- **React 19.2.0** - Latest React with new features
- **Bun** - Fast JavaScript runtime (optional)

### UI & Styling
- **Tailwind CSS v4.3.3** - Utility-first CSS framework
- **Radix UI** - Headless, accessible UI primitives
- **shadcn/ui** - Pre-built, customizable components
- **Lucide React** - Icon library
- **Tailwind Merge** - Class name merging utilities
- **Tailwind Animate** - Animation utilities
- **clsx** - Class name utilities
- **class-variance-authority** - Class variant management

### State Management
- **Zustand 5.0.14** - Lightweight state management
- **@tanstack/react-query 5.101.4** - Server state management

### Data Visualization
- **Recharts 2.15.4** - Charting library
- **Framer Motion 12.43.0** - Animation library

### Forms & Validation
- **React Hook Form 7.83.0** - Form management
- **Zod 3.25.76** - Schema validation
- **@hookform/resolvers** - Integration between React Hook Form and Zod

### Utilities
- **date-fns 4.4.0** - Date manipulation
- **Lottie React 2.4.1** - Animation support
- **Embla Carousel React 8.5.1** - Carousel component
- **cmdk 1.0.4** - Command palette
- **vaul 1.1.2** - Drawer component
- **sonner 1.7.4** - Toast notifications
- **input-otp 1.4.1** - OTP input component
- **react-day-picker 9.8.0** - Date picker
- **react-resizable-panels 2.1.9** - Resizable panel components

### HTTP Client
- **Axios 1.12.0** - Promise-based HTTP client

## Architecture

### Design System: Night Watch

Sentinel Client uses the **Night Watch** design system with:

- Dark-first color scheme optimized for control rooms
- High-contrast, readable typography
- Status indicators using severity colors (SERIOUS, MINOR, HARMLESS)
- Consistent spacing and layout patterns

### Color System

The application uses CSS custom properties (variables) for theming:

```css
/* Severity colors */
--sev-serious: #e53935
--sev-minor: #ffb74d
--sev-harmless: #81c784

/* Background colors */
--bg-base: #07090c
--bg-surface-1: #111418
--bg-surface-2: #1a1d21
--bg-terminal: #0a0b0d

/* Foreground colors */
--fg-1: #ffffff
--fg-2: #b0b8c1
--fg-3: #8a949e
--fg-4: #6e7681

/* Accent & borders */
--accent: #b8d4e8
--border-default: #21262d
--border-hairline: #1e2227
```

### Component Philosophy

- **Composable**: Components are designed to work together seamlessly
- **Accessible**: All interactive elements follow accessibility best practices
- **Type-safe**: TypeScript is used throughout for type safety
- **Responsive**: Works on desktop and mobile devices

## Key Pages & Features

### Landing Page
The public-facing landing page showcases:
- Live clock and system status
- Agent activity feed (Argus)
- Recent events panel
- Product features and workflow
- Role-based access information

### Authentication
- **Login** (`/login`) - User authentication
- **Register** (`/register`) - New account creation
- **Forgot Password** (`/forgot-password`) - Password recovery
- **Reset Password** (`/reset-password`) - Password reset
- **Email Verification** (`/opt`) - OTP verification

### Main Application
- **Overview** (`/overview`) - High-level system overview
- **Dashboard** (`/dashboard`) - Real-time monitoring dashboard
- **Sensors** (`/sensors`) - Sensor management and monitoring
- **Incidents** (`/incidents`) - Active and historical incidents
- **Incident Details** (`/incident/[id]`) - Detailed incident view
- **Investigate** (`/investigate`) - AI-powered investigation interface
- **Briefing** (`/briefing`) - Morning briefing review and approval

### Settings
- **General Settings** (`/settings/general`) - User preferences
- **API Keys** (`/settings/api-key`) - API key management
- **Webhooks** (`/settings/webhooks`) - Webhook configuration

### Documentation
- **Docs** (`/docs`) - Platform documentation

## API Integration

The client communicates with the Sentinel API server via:

### REST API Endpoints
All API endpoints are prefixed with `/api/v1` and proxied through Next.js rewrites.

### Authentication
- JWT-based authentication with httpOnly cookies
- Refresh token rotation
- API key authentication for machine/sensor data

### Real-time Updates
- Polling mechanism with 10-second refresh for sensor status
- Server-Sent Events (SSE) for live updates (planned)

## Docker Deployment

### Building the Image

```bash
# From the client directory
docker build -t sentinel-client .
```

### Running the Container

```bash
docker run -d \
  --name sentinel-client \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e API_UPSTREAM_URL=http://server:8000 \
  sentinel-client
```

### Docker Compose (Full Stack)

See the root [docker-compose.yml](../docker-compose.yml) for the complete deployment including:
- Client (Next.js)
- Server (API)
- MongoDB
- Redis
- ML Service
- Cloudflare Tunnel

## Development Guidelines

### Code Organization

1. **Components**: Use shadcn/ui for consistent, accessible components
2. **State Management**: Use Zustand for client state, React Query for server state
3. **API Calls**: Centralize API calls in the `services/` directory
4. **Types**: Use TypeScript interfaces for all data structures
5. **Styling**: Use Tailwind CSS utility classes

### File Naming Conventions

- **Pages**: `page.js` or `page.jsx` (Next.js convention)
- **Components**: `PascalCase.jsx` (e.g., `EventPanel.jsx`)
- **Hooks**: `useCamelCase.js` (e.g., `useEvents.js`)
- **Utilities**: `camelCase.js` (e.g., `formatDate.js`)

### Best Practices

1. **Performance**: Use `useMemo` and `useCallback` judiciously
2. **Accessibility**: Add proper ARIA attributes and keyboard navigation
3. **Error Handling**: Implement proper error boundaries and loading states
4. **Type Safety**: Define types for all props and API responses
5. **Testing**: Write unit tests for complex logic

## Security

### Authentication Flow

1. User logs in with email/password
2. Server returns JWT access token and refresh token
3. Access token stored in httpOnly cookie
4. Refresh token used to get new access tokens when expired
5. Token version invalidation on password change

### API Key Security

- API keys are hashed with SHA-256 before storage
- Raw keys are shown only once at creation
- Keys can be revoked and rotated
- Keys have configurable scopes and permissions

### Data Protection

- All sensitive data is encrypted in transit (HTTPS)
- Passwords are hashed with bcrypt
- Session tokens are stored in httpOnly cookies
- Organization isolation enforced at all levels

## Performance Optimization

### Next.js Features Used

- **App Router**: Modern routing with React Server Components
- **Static Generation**: Pre-rendered pages where possible
- **Dynamic Rendering**: Server-side rendering for authenticated pages
- **Image Optimization**: Automatic image optimization
- **Font Optimization**: Automatic font optimization

### Client-side Optimizations

- **Code Splitting**: Automatic code splitting with Next.js
- **Lazy Loading**: Dynamic imports for heavy components
- **React Query**: Efficient data fetching and caching
- **Memoization**: Proper use of `useMemo` and `useCallback`

## Monitoring & Analytics

### Built-in Monitoring

- **Health Check**: `/api/health` endpoint
- **Status Indicators**: Real-time system health visualization
- **Error Tracking**: Centralized error handling and reporting

### Metrics

Key performance metrics tracked:
- API response times
- Page load times
- Error rates
- User engagement

## Troubleshooting

### Common Issues

1. **Build Failures**:
   ```bash
   npm run build
   # Check for TypeScript errors or missing dependencies
   ```

2. **API Connection Issues**:
   - Verify `NEXT_PUBLIC_API_URL` is correct
   - Check CORS configuration on the server
   - Ensure the server is running

3. **Styling Issues**:
   - Verify Tailwind CSS is properly configured
   - Check for conflicting class names
   - Ensure CSS variables are defined

4. **Authentication Problems**:
   - Verify JWT secrets match between client and server
   - Check cookie settings (SameSite, Secure flags)
   - Ensure HTTPS in production

## Contributing

### Setup

1. Fork the repository
2. Create a feature branch
3. Install dependencies
4. Make your changes
5. Run tests and linting
6. Submit a pull request

### Code Review Guidelines

- Follow existing code patterns and conventions
- Add TypeScript types for new functionality
- Include tests for new features
- Update documentation as needed
- Keep commits focused and descriptive

## License

This project is proprietary. All rights reserved.

## Support

For support and inquiries, contact:
- Email: support@sentinel.io
- Documentation: Available in-app at `/docs`

## Version Information

- **Client Version**: 0.1.0
- **Next.js**: 16.2.12
- **React**: 19.2.0
- **Tailwind CSS**: 4.3.3

---

## Quick Reference

### Useful Commands

```bash
# Development
npm run dev

# Production build
npm run build

# Start production server
npm run start

# Run linting
npm run lint

# Clean build
rm -rf .next node_modules
npm install
npm run build
```

### File Locations

| Purpose | Location |
|---------|----------|
| Page Components | `src/app/` |
| Reusable Components | `src/components/` |
| Custom Hooks | `src/hooks/` |
| API Services | `src/services/` |
| Utilities | `src/utils/` |
| Styles | `src/styles/` |
| Configuration | `next.config.mjs`, `tailwind.config.js` |

### Environment Files

- `.env.example` - Template for environment variables
- `.env` - Local development environment (gitignored)
- `.env.local` - Local overrides (optional)

---

*Built for industrial site operators. Sentinel — Overnight Intelligence Platform.*
