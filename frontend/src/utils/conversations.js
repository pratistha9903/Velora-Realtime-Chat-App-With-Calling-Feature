/** Sort chats: pinned first, then most recent activity */
export function sortConversations(list) {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const aT = a.lastMessageAt || a.createdAt;
    const bT = b.lastMessageAt || b.createdAt;
    return new Date(bT) - new Date(aT);
  });
}
