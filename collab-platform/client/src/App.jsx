import React, { useContext, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, useNavigate } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// General Components
import Navbar from './components/layout/Navbar';
import PrivateRoute from './components/routing/PrivateRoute';

// Pages
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ProfilePage from './pages/ProfilePage';
import RoomPage from './pages/RoomPage';
import IDEPage from './pages/IDEPage';
import ForumPage from './pages/ForumPage';

// Context and Socket
import AuthContext from './context/AuthContext';
import { socket } from './socket';

// We need an inner component to use the navigate hook inside the context of Router
const AppContent = () => {
  const { user, isAuthenticated } = useContext(AuthContext);
  const navigate = useNavigate();

  // Socket.io Connection Logic
  useEffect(() => {
    if (isAuthenticated && user) {
      // Connect socket when user logs in
      socket.connect();
      socket.emit('register-user', user._id);

      // Listen for notifications
      const handleNewNotification = ({ message }) => {
          toast.info(message, {
              position: "top-right",
              autoClose: 10000,
              hideProgressBar: false,
              closeOnClick: true,
              pauseOnHover: true,
              draggable: true,
              progress: undefined,
              theme: "dark",
              onClick: () => navigate('/dashboard')
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
  }, [isAuthenticated, user, navigate]);

  return (
    <>
      <Navbar />
      <main>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Private Routes */}
          <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
          
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
    </>
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