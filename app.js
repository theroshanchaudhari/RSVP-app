(function () {
  function clean(value, fallback) {
    const trimmed = String(value || "").trim();
    return trimmed || fallback;
  }

  function parseInviteParams(search) {
    const params = new URLSearchParams(search || "");
    return {
      guest: clean(params.get("guest"), "Guest"),
      event: clean(params.get("event"), "Our Celebration"),
      date: clean(params.get("date"), "Soon"),
      host: clean(params.get("host"), "Your Host")
    };
  }

  function buildInviteLink(baseUrl, inviteData) {
    const invite = {
      guest: clean(inviteData.guest, "Guest"),
      event: clean(inviteData.event, "Our Celebration"),
      date: clean(inviteData.date, "Soon"),
      host: clean(inviteData.host, "Your Host")
    };
    const url = new URL(baseUrl);
    url.searchParams.set("guest", invite.guest);
    url.searchParams.set("event", invite.event);
    if (invite.date !== "Soon") {
      url.searchParams.set("date", invite.date);
    } else {
      url.searchParams.delete("date");
    }
    url.searchParams.set("host", invite.host);
    return url.toString();
  }

  function createInviteMessage(invite) {
    return `${invite.guest}, you're invited to ${invite.event} by ${invite.host}${
      invite.date !== "Soon" ? ` on ${invite.date}` : ""
    }.`;
  }

  function initializeBrowserUI() {
    const invite = parseInviteParams(window.location.search);

    const title = document.getElementById("invite-title");
    const subtitle = document.getElementById("invite-subtitle");
    const rsvpForm = document.getElementById("rsvp-form");
    const confirmation = document.getElementById("confirmation");

    const inviteLinkForm = document.getElementById("invite-link-form");
    const inviteLinkOutput = document.getElementById("invite-link");
    const guestInput = document.getElementById("guest-name");
    const eventInput = document.getElementById("event-name");
    const dateInput = document.getElementById("event-date");
    const hostInput = document.getElementById("host-name");

    title.textContent = `${invite.guest}, you're invited!`;
    subtitle.textContent = `${invite.event}${
      invite.date !== "Soon" ? ` on ${invite.date}` : ""
    } — hosted by ${invite.host}.`;

    guestInput.value = invite.guest;
    eventInput.value = invite.event;
    dateInput.value = invite.date === "Soon" ? "" : invite.date;
    hostInput.value = invite.host;

    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    inviteLinkOutput.value = buildInviteLink(baseUrl, invite);

    inviteLinkForm.addEventListener("submit", function (event) {
      event.preventDefault();
      inviteLinkOutput.value = buildInviteLink(baseUrl, {
        guest: guestInput.value,
        event: eventInput.value,
        date: dateInput.value,
        host: hostInput.value
      });
    });

    rsvpForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const response = document.getElementById("response").value;
      const key = `rsvp:${invite.event}:${invite.guest}`;
      const payload = {
        guest: invite.guest,
        event: invite.event,
        host: invite.host,
        response,
        updatedAt: new Date().toISOString()
      };
      window.localStorage.setItem(key, JSON.stringify(payload));
      confirmation.textContent = `${invite.guest}, your RSVP was recorded as "${response}".`;
    });
  }

  const exported = {
    parseInviteParams,
    buildInviteLink,
    createInviteMessage
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exported;
  }

  if (typeof window !== "undefined") {
    window.rsvpApp = exported;
    if (window.document) {
      window.addEventListener("DOMContentLoaded", initializeBrowserUI);
    }
  }
})();
