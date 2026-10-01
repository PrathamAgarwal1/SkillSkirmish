import React, { useContext, useEffect, useRef } from 'react';
import { HashRouter as Router, Route, Routes, useNavigate } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// General Components
import Navbar from './components/layout/Navbar';
import PrivateRoute from './components/routing/PrivateRoute';
import AISidebar from './components/AI/AISidebar';
import ServerStatusBanner from './components/layout/ServerStatusBanner';

// Pages
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ProfilePage from './pages/ProfilePage';
import RoomPage from './pages/RoomPage';
import IDEPage from './pages/IDEPage';
import AssessmentPage from './pages/AssessmentPage';
import ForumPage from './pages/ForumPage';
import GoogleCallbackPage from './pages/GoogleCallbackPage';
import GalleryPage from './pages/GalleryPage';

// Context and Socket
import AuthContext from './context/AuthContext';
import { socket } from './socket';

// Voice & video (Discord-style channels; the call survives page changes)
import VoiceProvider from './voice/VoiceProvider';
import VoiceOverlay from './components/voice/VoiceOverlay';

// We need an inner component to use the navigate hook inside the context of Router
const AppContent = () => {
  const { user, isAuthenticated } = useContext(AuthContext);
  const navigate = useNavigate();
  // useNavigate() returns a new function on every route change; reading it through a ref keeps the
  // socket effect below from disconnecting/reconnecting on every navigation (which dropped calls)
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const userId = user?._id;

  // Socket.io Connection Logic
  useEffect(() => {
    if (isAuthenticated && userId) {
      // Connect socket when user logs in. The server identifies the user from the
      // JWT sent in the socket handshake (see socket.js).
      socket.connect();

      // Listen for notifications
      const handleNewNotification = (notification) => {
        const message = notification?.message;
        if (!message) return;
        toast.info(message, {
          position: "top-right",
          autoClose: 10000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
          theme: "dark",
          // @mentions open the room they came from
          onClick: () => navigateRef.current(notification.type === 'mention' && notification.relatedId ? `/rooms/${notification.relatedId}` : '/dashboard')
        });
      };

      socket.on('new-notification', handleNewNotification);

      return () => {
        socket.off('new-notification', handleNewNotification);
        socket.disconnect();
      };
    } else {
      // Disconnect if logged out
      socket.disconnect();
    }
  }, [isAuthenticated, userId]);

  return (
    <VoiceProvider>
      <div className="crt-overlay"></div>
      <ServerStatusBanner />
      <Navbar />
      <main className="app-content">
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />
          <Route path="/gallery" element={<GalleryPage />} />

          {/* Private Routes */}
          <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />

          {/* Assessment Route */}
          <Route path="/assessment/:skill" element={<PrivateRoute><AssessmentPage /></PrivateRoute>} />

          {/* EXISTING: My Profile */}
          <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />

          {/* NEW: View Other Profile */}
          <Route path="/profile/:userId" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />

          <Route path="/forum" element={<PrivateRoute><ForumPage /></PrivateRoute>} />

          {/* Room and Project Routes */}
          <Route path="/rooms/:roomId" element={<PrivateRoute><RoomPage /></PrivateRoute>} />
          <Route path="/projects/:projectId" element={<PrivateRoute><IDEPage /></PrivateRoute>} />
        </Routes>
      </main>
      <AISidebar />
      <VoiceOverlay />
    </VoiceProvider>
  );
};

const App = () => {
  return (
    // Note: Ensure your <AuthProvider> wraps <App /> in your index.js file
    <Router>
      <ToastContainer />
      <AppContent />
    </Router>
  );
};

export default App;