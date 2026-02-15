'use client';

import { useState, useRef, useEffect } from 'react';
import { BellIcon, CheckIcon, TrashIcon } from '@heroicons/react/24/outline';
import type { Notification } from '@/lib/defog/types';

interface NotificationsProps {
  notifications: Notification[];
  onMarkRead: (id: string) => void;
  onClearAll: () => void;
}

export function Notifications({
  notifications,
  onMarkRead,
  onClearAll,
}: NotificationsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffHours > 24) {
      return date.toLocaleDateString();
    }
    if (diffHours > 0) {
      return `${diffHours}h ago`;
    }
    if (diffMins > 0) {
      return `${diffMins}m ago`;
    }
    return 'Just now';
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 hover:bg-white/10 rounded-lg transition-colors"
      >
        <BellIcon className="w-6 h-6 text-white" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#ff3366] text-white text-xs font-medium rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-[#2d2d2d] rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="flex justify-between items-center p-3 border-b border-[#3d3d3d]">
            <h3 className="font-medium text-white">Notifications</h3>
            {notifications.length > 0 && (
              <button
                onClick={onClearAll}
                className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
              >
                <TrashIcon className="w-3 h-3" />
                Clear all
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                No notifications
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-3 border-b border-[#3d3d3d] last:border-b-0 ${
                    !notification.read ? 'bg-[#3d3d3d]/50' : ''
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-medium ${
                            notification.type === 'buy_signal'
                              ? 'text-[#00ff88]'
                              : 'text-[#ffaa00]'
                          }`}
                        >
                          {notification.ticker}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatTime(notification.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-300 mt-0.5">
                        {notification.message}
                      </p>
                    </div>
                    {!notification.read && (
                      <button
                        onClick={() => onMarkRead(notification.id)}
                        className="p-1 hover:bg-white/10 rounded"
                      >
                        <CheckIcon className="w-4 h-4 text-gray-400" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
