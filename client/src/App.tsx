import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import Management from "@/pages/Management";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Management} />
      <Route path="/sales" component={Management} />
      <Route path="/catalog" component={Management} />
      <Route path="/inventory" component={Management} />
      <Route path="/purchases" component={Management} />
      <Route path="/returns" component={Management} />
      <Route path="/invoices/:id" component={Management} />
      <Route path="/partners" component={Management} />
      <Route path="/reports" component={Management} />
      <Route path="/admin" component={Management} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
