import React, { useEffect, useRef } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { RoomProvider, useRoom } from './contexts/RoomContext';
import Login from './components/Auth/Login';
import Register from './components/Auth/Register';
import Lobby from './components/Room/Lobby';
import CreateRoom from './components/Room/CreateRoom';
import JoinRoom from './components/Room/JoinRoom';
import RoomView from './components/Room/RoomView';
import AdminPanel from './components/Admin/AdminPanel';
import Profile from './components/Profile/Profile';
import { Toaster, toast } from 'sonner';
import { readNavState, writeNavState } from './utils/sessionPersistence';
import './App.css';

// ─── Loading screen ─────────────────────────────────────────────────────────
const LoadingScreen = () => (
  <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950">
    <div className="text-center">
      <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-2xl font-bold text-white animate-pulse">
        W
      </div>
      <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-purple-500 border-r-transparent"></div>
      <p className="mt-4 text-purple-300 text-sm">Loading WYTH...</p>
    </div>
  </div>
);

// ─── LuxeView — smooth fade keyed on current pathname ───────────────────────
const LuxeView = ({ children }) => {
  const location = useLocation();
  return (
    <div key={location.pathname} className="luxe-view-fade">{children}</div>
  );
};

// ─── ProtectedRoute — requires auth ────────────────────────────────────────
const ProtectedRoute = () => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!user) {
    // Remember where the user was trying to go so we can return them after login
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
};

// ─── PublicOnlyRoute — for /login & /signup; bounces logged-in users away ─
const PublicOnlyRoute = () => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (user) {
    const intended = location.state?.from?.pathname && location.state.from.pathname !== '/login'
      ? location.state.from.pathname + (location.state.from.search || '')
      : '/lobby';
    return <Navigate to={intended} replace />;
  }
  return <Outlet />;
};

// ─── Auth screens (use react-router navigate, no internal toggle state) ────
const LoginScreen = () => {
  const navigate = useNavigate();
  return <Login onSwitchToRegister={() => navigate('/signup')} />;
};

const SignupScreen = () => {
  const navigate = useNavigate();
  return <Register onSwitchToLogin={() => navigate('/login')} />;
};

// ─── Lobby wrappers — main / create / join ─────────────────────────────────
const LobbyScreen = () => {
  const navigate = useNavigate();
  return (
    <Lobby
      onEnterRoom={(roomId) => navigate(`/room/${roomId}`)}
      onShowAdmin={() => navigate('/admin')}
      onShowProfile={() => navigate('/profile')}
      onCreate={() => navigate('/lobby/create')}
      onJoin={() => navigate('/lobby/join')}
    />
  );
};

const LobbyCreateScreen = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 flex items-center justify-center p-4">
      <div>
        <CreateRoom onRoomCreated={(roomId) => navigate(`/room/${roomId}`)} />
        <button
          onClick={() => navigate('/lobby')}
          className="mt-4 text-sm text-slate-400 hover:text-purple-300 transition-colors block mx-auto"
          data-testid="lobby-back-btn"
        >
          Back to lobby
        </button>
      </div>
    </div>
  );
};

const LobbyJoinScreen = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 flex items-center justify-center p-4">
      <div>
        <JoinRoom onRoomJoined={(roomId) => navigate(`/room/${roomId}`)} />
        <button
          onClick={() => navigate('/lobby')}
          className="mt-4 text-sm text-slate-400 hover:text-purple-300 transition-colors block mx-auto"
          data-testid="lobby-back-btn"
        >
          Back to lobby
        </button>
      </div>
    </div>
  );
};

const ProfileScreen = () => {
  const navigate = useNavigate();
  return <Profile onBack={() => navigate('/lobby')} />;
};

const AdminScreen = () => {
  const navigate = useNavigate();
  return <AdminPanel onBack={() => navigate('/lobby')} />;
};

// ─── RoomGate — deep-link rejoin handler ───────────────────────────────────
// Ensures that when the user lands on /room/:roomId directly (refresh,
// shared link, back button), the existing room state is reused when the
// id matches, otherwise `joinRoom(roomId)` is called exactly once.
// StrictMode-safe via useRef guard. Also navigates away cleanly when the
// user is kicked / banned / leaves (currentRoom drops to null).
const RoomGate = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { currentRoom, joinRoom } = useRoom();
  const attempted = useRef(null);   // last roomId we initiated a join for
  const joined = useRef(false);     // true once we observed currentRoom===roomId

  // Initiate the join (exactly once per roomId).
  useEffect(() => {
    if (authLoading || !user) return;
    if (!roomId) return;
    if (currentRoom?.id === roomId) return; // already in the right room
    if (attempted.current === roomId) return; // StrictMode double-mount guard
    attempted.current = roomId;

    joinRoom(roomId).then((res) => {
      if (!res || !res.success) {
        toast.error(res?.error || 'Could not join this room', { duration: 3500 });
        writeNavState({ roomId: null });
        navigate('/lobby', { replace: true });
      }
    });
  }, [authLoading, user, roomId, currentRoom?.id, joinRoom, navigate]);

  // Record successful join so we can detect later kick/ban/leave.
  useEffect(() => {
    if (currentRoom?.id === roomId) joined.current = true;
  }, [currentRoom?.id, roomId]);

  // Kick / ban / leave handling: we already joined this room and now
  // currentRoom is null → context has cleared the session for us, bounce
  // the user back to the lobby instead of letting RoomGate re-attempt.
  useEffect(() => {
    if (!authLoading && user && joined.current && !currentRoom) {
      navigate('/lobby', { replace: true });
    }
  }, [authLoading, user, currentRoom, navigate]);

  if (!currentRoom || currentRoom.id !== roomId) return <LoadingScreen />;
  return <RoomView />;
};

// ─── Index redirect ────────────────────────────────────────────────────────
// "/" should resolve to /lobby (or /login via ProtectedRoute if logged out).
// If a roomId is persisted from the previous session and the user just
// reopened the tab without a URL, we honour that one-time and send them
// straight back into their room. The URL then becomes the source of truth.
const IndexRedirect = () => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  const saved = readNavState();
  if (saved?.roomId) return <Navigate to={`/room/${saved.roomId}`} replace />;
  return <Navigate to="/lobby" replace />;
};

// ─── Routes ────────────────────────────────────────────────────────────────
const AppRoutes = () => (
  <LuxeView>
    <Routes>
      {/* Public-only auth routes */}
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/signup" element={<SignupScreen />} />
      </Route>

      {/* Protected app routes */}
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<IndexRedirect />} />
        <Route path="/lobby" element={<LobbyScreen />} />
        <Route path="/lobby/create" element={<LobbyCreateScreen />} />
        <Route path="/lobby/join" element={<LobbyJoinScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/admin" element={<AdminScreen />} />
        <Route path="/room/:roomId" element={<RoomGate />} />
      </Route>

      {/* Catch-all: send to "/" which decides between lobby / login. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </LuxeView>
);

// ─── Root ──────────────────────────────────────────────────────────────────
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RoomProvider>
          <AppRoutes />
          <Toaster
            position="top-center"
            theme="dark"
            richColors={false}
            closeButton={false}
            toastOptions={{
              style: {
                background: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid rgba(168, 85, 247, 0.4)',
                color: '#e9d5ff',
                backdropFilter: 'blur(12px)',
                fontSize: '13px',
                fontWeight: 500,
              },
            }}
          />
        </RoomProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
