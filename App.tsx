import { useAuth } from "./hooks/useAuth";
import { MapScreen } from "./screens/MapScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { LoadingScreen } from "./screens/LoadingScreen";

export default function App() {
  const { session, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!session) {
    return <LoginScreen />;
  }

  return <MapScreen />;
}