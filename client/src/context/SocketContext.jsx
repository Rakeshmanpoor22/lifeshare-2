import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

const SocketContext = createContext();

export const useSocket = () => {
    return useContext(SocketContext);
};

export const SocketProvider = ({ children }) => {
    const { user } = useAuth();
    const [socket, setSocket] = useState(null);

    useEffect(() => {
        if (user && user.id) {
            const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
            const newSocket = io(socketUrl);

            newSocket.on('connect', () => {
                console.log('Connected to socket server');
                newSocket.emit('join', user.id);
            });

            const handleNotification = (data) => {
                if (!data || !data.message) return;
                const toastId = data.id || `${data.type || 'notif'}_${data.message}`;
                toast(data.message, {
                    id: toastId,
                    icon: data.type === 'match' ? '🚨' : '🔔',
                    duration: 5000,
                    style: {
                        background: '#333',
                        color: '#fff',
                    },
                });
                
                const event = new CustomEvent('socket_notification', { detail: data });
                window.dispatchEvent(event);
            };

            newSocket.on('new_notification', handleNotification);

            setSocket(newSocket);

            return () => {
                newSocket.off('new_notification', handleNotification);
                newSocket.disconnect();
            };
        } else {
            if (socket) {
                socket.disconnect();
                setSocket(null);
            }
        }
    }, [user]);

    return (
        <SocketContext.Provider value={socket}>
            {children}
        </SocketContext.Provider>
    );
};
