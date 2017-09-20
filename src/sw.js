skipWaiting();
onactivate = function(e) {
  e.waitUntil(clients.claim()
    .then(function() { return self.registration.unregister(); }
      .then(function() { return Promise.reject(); })));
};
