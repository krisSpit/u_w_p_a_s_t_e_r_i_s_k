

var overlay = false;
var userAgent = null;
var localSoundMeter = null;
var remoteSoundMeter = null;
var deviceInfo = [];
var SipSession;
var mic = null;
var speaker = null;
var IsSendDevices = false;
var user_Asterisk = null;
var password_Asterisk = null;
var domainAsterisk = null;
var conference = null;
var secs = 0;
var interval;
var mins = 0;
var hors = 0;

function spSetUserData(data) {
    if (data != null) {
        user_Asterisk = data.asteriskUserExtension;
        password_Asterisk = data.asteriskPassword;
        domainAsterisk = data.asteriskUrlDomain;
        conference = data.asteriskConferenceExtension;
    }
}
function spCheckDevices() {
    return navigator.mediaDevices.enumerateDevices().then(function (deviceInfos) {
        // Video
        let savedVideoDevice = { deviceId: 'default', label: 'labelDefault' };
        let videoDeviceFound = false;
        let videoFound = false;
        let videoInputDevices = [];

        // Audio Input
        let savedAudioDevice = { deviceId: 'default', label: 'labelDefault' };
        let microphoneFound = false;
        let audioDeviceFound = false;
        let audioInputDevices = [];

        // Audio Output
        let savedSpeakerDevice = { deviceId: 'default', label: 'labelDefault' };
        let speakerFound = false;
        let speakerDeviceFound = false;
        let speakerDevices = [];

        for (let i = 0; i < deviceInfos.length; ++i) {
            // Check Devices
            if (deviceInfos[i].kind === 'audioinput') {
                microphoneFound = true;
                audioInputDevices.push(deviceInfos[i]);
                if (savedAudioDevice != 'default' && deviceInfos[i].deviceId == savedAudioDevice) {
                    audioDeviceFound = true;
                }
            } else if (deviceInfos[i].kind === 'audiooutput') {
                speakerFound = true;
                speakerDevices.push(deviceInfos[i]);
                if (savedSpeakerDevice != 'default' && deviceInfos[i].deviceId == savedSpeakerDevice) {
                    speakerDeviceFound = true;
                }
            } else if (deviceInfos[i].kind === 'videoinput') {
                videoFound = true;
                videoInputDevices.push(deviceInfos[i]);
                if (savedVideoDevice != 'default' && deviceInfos[i].deviceId == savedVideoDevice) {
                    videoDeviceFound = true;
                }
            }
        }
        console.log('LEGO [spStartCall] Set Mic:', audioInputDevices[0])
        mic = audioInputDevices[0];
        window.chrome.webview.postMessage(JSON.stringify(audioInputDevices));
        console.log('LEGO [spStartCall] Set Speaker:', speakerDevices[0]);
        speaker = speakerDevices[0];
        window.chrome.webview.postMessage(JSON.stringify(speakerDevices));
        videoFound = false; //-- Video disabled for now
        let constraints = {
            audio: microphoneFound,
            video: videoFound
        }
        if (microphoneFound) {
            // @ts-ignore
            constraints.audio = {
                deviceId: 'default',
                autoGainControl: false,
                echoCancellation: false,
                noiseSuppression: false,
                googAutoGainControl: false,
            };
            if (audioDeviceFound) {
                // @ts-ignore
                constraints.audio.deviceId = { exact: savedAudioDevice }
            }
            else {

            }
        }
        if (videoFound) {
            // @ts-ignore
            constraints.video = { deviceId: 'default' }
            if (videoDeviceFound) {
                // @ts-ignore
                constraints.video.deviceId = { exact: savedVideoDevice }
            }
        }
        deviceInfo = {
            // How get the local tracks
            constraints,

            // check if devices exist
            audioDeviceFound,   // Exist mic
            microphoneFound,    // Exist mic id

            videoFound,         // Exist video
            videoDeviceFound,   // Exist video id

            speakerFound,       // Exist Speaker
            speakerDeviceFound, // Exist Speaker Id

            // Device Id - If Exist
            savedVideoDevice,
            savedAudioDevice,
            savedSpeakerDevice,

            // List of available devices
            videoInputDevices,
            audioInputDevices,
            speakerDevices
        };

        return Promise.resolve(deviceInfo);
    });
}
function spInitMediaDevices() {

    let proReturn;
    let localMicrophoneStream = new MediaStream();
    if (navigator.mediaDevices) {
        proReturn = spCheckDevices().then((info) => {
            return navigator.mediaDevices.getUserMedia(info.constraints).then(function (mediaStream) {
                // Handle Audio
                let audioTrack = (mediaStream.getAudioTracks().length >= 1) ? mediaStream.getAudioTracks()[0] : null;
                if (info.microphoneFound && audioTrack != null) {
                    audioTrack.enabled = true;
                    localMicrophoneStream.addTrack(audioTrack);
                    // @ts-ignore
                    window.SettingsMicrophoneStream = localMicrophoneStream;
                    // window.SettingsMicrophoneSoundMeter = MeterSettingsOutput(localMicrophoneStream, 'Settings_MicrophoneOutput', 'width', 50);
                }
                // Display Output Levels
                if (!info.speakerFound) {
                }
            })
        })
    } else {
        proReturn = Promise.resolve();
    }
    return proReturn;
}
function spRegister() {
    if (userAgent == null) return;
    if (userAgent.registering == true) return;
    if (userAgent.isRegistered()) return;
    let RegistererRegisterOptions = {
        requestDelegate: {
            onReject: function (sip) {
                console.log('LEGO [spRegister] onReject: ', sip);
            }
        }
    }
    console.log('LEGO [spRegister] Sending Registration...', userAgent);
    userAgent.registering = true
    userAgent.registerer.register(RegistererRegisterOptions);
}
function spRegistered() {
    // This code fires on re-register after session timeout
    // to ensure that events are not fired multiple times
    // a isReRegister state is kept.
    // TODO: This check appears obsolete
    userAgent.registrationCompleted = true;
    if (!userAgent.isReRegister) {
        console.log('LEGO [spRegistered] Registered!');
        userAgent.registering = false;
    } else {
        userAgent.registering = false;
        console.log('LEGO [spRegistered] ReRegistered!');
    }
    userAgent.isReRegister = true;
}
function spUnregister() {
    if (userAgent == null || !userAgent.isRegistered()) return;
    console.log('LEGO [spRegister] Unregister.');
    userAgent.registerer.unregister();
    userAgent.transport.attemptingReconnection = false;
    userAgent.registering = false;
    userAgent.isReRegister = false;
}
function spOnTransportConnected() {
    console.log('LEGO [onTransportConnected] Connected to Web Socket!');
    userAgent.isReRegister = false;
    userAgent.transport.attemptingReconnection = false;
    userAgent.transport.ReconnectionAttempts = SIP.TransportReconnectionAttempts;

    // Auto start register
    if (userAgent.transport.attemptingReconnection == false && userAgent.registering == false) {
        window.setTimeout(function () {
            spRegister();
        }, 500);
    } else {
        console.log('LEGO [onTransportConnected]: Register() called, but attemptingReconnection is true or registering is true')
    }
}
async function spCreateUserAgent() {
    debugger;
    console.log(user_Asterisk);
    let options = {
        uri: SIP.UserAgent.makeURI('sip:' + user_Asterisk + '@' + domainAsterisk),
        transportOptions: {
            server: "wss://" + domainAsterisk + ":8089/ws",
            traceSip: true,
        },
        sessionDescriptionHandlerFactoryOptions: {
            peerConnectionConfiguration: {
                bundlePolicy: 'balanced',
            },
            iceGatheringTimeout: 500
        },
        contactName: '',
        displayName: user_Asterisk,
        authorizationUsername: user_Asterisk,
        authorizationPassword: password_Asterisk,          // Asterisk should also be set to rewrite contact
        userAgentString: "EDUAC UWP JS",
        autoStart: false,
        autoStop: true,
        register: false,
        contactParams: {},
        delegate: {
            onInvite: function (sip) {
                //alert(sip)
            },
            onMessage: function (sip) {
                //alert(sip)
            }
        }
    }
    options.contactParams.transport = 'wss';
    userAgent = new SIP.UserAgent(options);
    userAgent.isRegistered = function () {
        return (userAgent && userAgent.registerer && userAgent.registerer.state == SIP.RegistererState.Registered);
    }
    userAgent.sessions = userAgent._sessions;
    userAgent.registrationCompleted = false;
    userAgent.registering = false;
    userAgent.transport.attemptingReconnection = false;
    userAgent.BlfSubs = [];
    userAgent.lastVoicemailCount = 0;

    console.info('LEGO [spCreateUserAgent] Creating User Agent... Done');
    userAgent.transport.onConnect = function () {
        spOnTransportConnected();
        console.log(userAgent);
    }
    userAgent.transport.onDisconnect = function (error) {
        if (error) {
        } else {
        }
    }
    let RegistererOptions = {
        extraHeaders: [],
        extraContactHeaderParams: []
    }
    if (SIP.RegisterExtraHeaders && SIP.RegisterExtraHeaders != '' && SIP.RegisterExtraHeaders != '{}') {
        try {
            let registerExtraHeaders = JSON.parse(SIP.RegisterExtraHeaders);
            for (const [key, value] of Object.entries(registerExtraHeaders)) {
                if (value != '') {
                    RegistererOptions.extraHeaders.push(key + ': ' + value);
                }
            }
        } catch (e) {
            console.log('LEGO [spCreateUserAgent] registerExtraHeaders', e);
        }
    }

    // Added to the contact AFTER the '>' (not permanent)
    if (SIP.RegisterExtraContactParams && SIP.RegisterExtraContactParams != '' && SIP.RegisterExtraContactParams != '{}') {
        try {
            let registerExtraContactParams = JSON.parse(SIP.RegisterExtraContactParams);
            for (const [key, value] of Object.entries(registerExtraContactParams)) {
                if (value == '') {
                    RegistererOptions.extraContactHeaderParams.push(key);
                } else {
                    RegistererOptions.extraContactHeaderParams.push(key + ':' + value);
                }
            }
        } catch (e) {
            console.log('LEGO [spCreateUserAgent] RegisterExtraContactParams: ', e);
        }
    }
    userAgent.registerer = new SIP.Registerer(userAgent, RegistererOptions);
    userAgent.registerer.stateChange.addListener(async function (newState) {

        switch (newState) {
            case SIP.RegistererState.Initial:
                // Nothing to do
                break;
            case SIP.RegistererState.Registered:
                spRegistered();
                await spAudioCall(conference, null);
                await spInitSoundMeter();
                break;
            case SIP.RegistererState.Unregistered:
                //_this.spOnUnregistered();
                break;
            case SIP.RegistererState.Terminated:
                //alert("BREVE")
                break;
        }
    });

    return userAgent.start();
}
function spOnTrackAddedEvent(event) {
    console.log('LEGO [onTrackAddedEvent] EVENT: ', event)
    debugger;
    let session = SipSession;
    let pc = session.sessionDescriptionHandler.peerConnection;
    let remoteAudioStream = new MediaStream();

    pc.getTransceivers().forEach(function (transceiver) {
        // Add Media
        let receiver = transceiver.receiver;
        if (receiver.track) {
            if (receiver.track.kind == 'audio') {
                console.log('Adding Remote Audio Track');
                remoteAudioStream.addTrack(receiver.track);
            }
        }
    });
    // Attach Audio
    if (remoteAudioStream.getAudioTracks().length >= 1) {
        $('#call_container_audio').html('');
        $('#call_container_audio').append(`
            <div style='display:none;'>
                <audio id='remote-audio'></audio>
            </div>`);

        let remoteAudio = $('#remote-audio').get(0);
        remoteAudio.srcObject = remoteAudioStream;
        remoteAudio.onloadedmetadata = function (e) {
            if (typeof remoteAudio.sinkId !== 'undefined') {
                remoteAudio.setSinkId("default").then(function () {
                    console.log('LEGO [onTrackAddedEvent] sinkId applied: ');
                }).catch(function (e) {
                    console.log('LEGO [onTrackAddedEvent] Error using setSinkId: ', e);
                });
            }
            remoteAudio.play();
        }
    }
}
function spOnSessionDescriptionHandlerCreated(sdh, provisional, includeVideo) {
    console.log('LEGO [spOnSessionDescriptionHandlerCreated] Init ...');
    if (sdh) {
        if (sdh.peerConnection) {
            sdh.peerConnection.ontrack = function (event) {
                spOnTrackAddedEvent(event);
            }
        } else {
            console.log('LEGO [onSessionDescriptionHandler] fired without a peerConnection');
        }
    } else {
        console.log('LEGO [onSessionDescriptionHandler] fired without a sessionDescriptionHandler');
    }
}
function spTeardownSession() {
    let session = SipSession;
    console.log('LEGO [spTeardownSession] Init ...');
    if (session == null) return;

    if (session.data.teardownComplete == true) return;
    session.data.teardownComplete = true; // Run this code only once

    // End any child calls
    if (session.data.childsession) {
        session.data.childsession.dispose().then(function () {
            session.data.childsession = null;
        }).catch(function (error) {
            session.data.childsession = null;
            // Suppress message
        });
    }

    // Mixed Tracks
    if (session.data.AudioSourceTrack && session.data.AudioSourceTrack.kind == 'audio') {
        session.data.AudioSourceTrack.stop();
        session.data.AudioSourceTrack = null;
    }
    // Stop any Early Media
    if (session.data.earlyMedia) {
        session.data.earlyMedia.pause();
        session.data.earlyMedia.removeAttribute('src');
        session.data.earlyMedia.load();
        session.data.earlyMedia = null;
    }
    // Stop any ringing calls
    if (session.data.ringerObj) {
        session.data.ringerObj.pause();
        session.data.ringerObj.removeAttribute('src');
        session.data.ringerObj.load();
        session.data.ringerObj = null;
    }

    // Audio Meters
    if (localSoundMeter != null) {
        localSoundMeter.stop();
        localSoundMeter = null;
    }
    if (remoteSoundMeter != null) {
        remoteSoundMeter.stop();
        remoteSoundMeter = null;
    }

    // Make sure you have released the microphone
    if (session && session.sessionDescriptionHandler && session.sessionDescriptionHandler.peerConnection) {
        let pc = session.sessionDescriptionHandler.peerConnection;
        pc.getSenders().forEach(function (RTCRtpSender) {
            if (RTCRtpSender.track && RTCRtpSender.track.kind == 'audio') {
                RTCRtpSender.track.stop();
            }
        });
    }

    // End timers
    window.clearInterval(session.data.videoResampleInterval);
    window.clearInterval(session.data.callTimer);
}

function spOnInviteRejected(response) {
    console.log('LEGO [spOnInviteRejected] INVITE Rejected:', response.message.reasonPhrase);
    let session = SipSession;
    session.data.terminateby = 'them';
    session.data.reasonCode = response.message.statusCode;
    session.data.reasonText = response.message.reasonPhrase;
    spTeardownSession();
    console.log('LEGO [spOnInviteRejected] EMIT CALL_STARTED false !!!', response.message);
    // this.$edEventBus.$emit(CALLS_EVENTS.CALL_STARTED, {origin:'spOnInviteRejected',
    //     status:false, reason: response.message.statusCode + ' - ' + response.message.reasonPhrase});
}
function spOnInviteAccepted(includeVideo, response) {
    // Call in progress
    let session = SipSession;
    if (session.data.earlyMedia) {
        session.data.earlyMedia.pause();
        session.data.earlyMedia.removeAttribute('src');
        session.data.earlyMedia.load();
        session.data.earlyMedia = null;
    }
    window.clearInterval(session.data.callTimer);
    let startTime = moment.utc();
    session.data.startTime = startTime;
    session.data.callTimer = {};
    session.isOnHold = false;
    session.data.started = true;

    console.log('LEGO [spOnInviteAccepted] EMIT CALL_STARTED true !!!');
    window.chrome.webview.postMessage("startCall");
}
function spOnSessionReceivedBye(response){
    // They Ended the call
    let session = SipSession;
    session.data.terminateby = 'them';
    session.data.reasonCode = 16;
    session.data.reasonText = 'Normal Call clearing';
    response.accept().then(() => {  // Send OK
        return spTeardownSession();
    }).then(() => {
        window.chrome.webview.postMessage("endCall");
        return spCleanCall();
    }).catch(function (e) {
        spTeardownSession();
        console.log('LEGO [spOnSessionReceivedBye] Failed to bye the session!', e);
    });
}
function spOnSessionReceivedMessage(response) {
    console.log('LEGO [spOnSessionReceivedMessage] Init ...');
    let messageType = (response.request.headers['Content-Type'].length >= 1) ? response.request.headers['Content-Type'][0].parsed : 'Unknown';
    if (messageType.indexOf('application/x-asterisk-confbridge-event') > -1) {
        // Conference Events JSON
        let msgJson = JSON.parse(response.request.body);
        let session = SipSession;
        if (!session.data.ConfbridgeChannels) session.data.ConfbridgeChannels = [];
        if (!session.data.ConfbridgeEvents) session.data.ConfbridgeEvents = [];

        if (msgJson.type == 'ConfbridgeStart') {
            console.log('LEGO [spOnSessionReceivedMessage] ConfbridgeStart!');
        } else if (msgJson.type == 'ConfbridgeWelcome') {
            console.log('LEGO [spOnSessionReceivedMessage] Welcome to the Asterisk Conference');
            console.log('LEGO [spOnSessionReceivedMessage] Bridge ID:', msgJson.bridge.id);
            console.log('LEGO [spOnSessionReceivedMessage] Bridge Name:', msgJson.bridge.name);
            console.log('LEGO [spOnSessionReceivedMessage] Created at:', msgJson.bridge.creationtime);
            console.log('LEGO [spOnSessionReceivedMessage] Video Mode:', msgJson.bridge.video_mode);

            session.data.ConfbridgeChannels = msgJson.channels; // Write over this
            session.data.ConfbridgeChannels.forEach(function (chan) {
                // The mute and unmute status doesn't appear to be a realtime state, only what the
                // startmuted= setting of the default profile is.
                console.log('LEGO [spOnSessionReceivedMessage] ', chan.caller.name, 'Is in the conference. Muted:', chan.muted, 'Admin:', chan.admin);
            });
        } else if (msgJson.type == 'ConfbridgeJoin') {
            msgJson.channels.forEach(function (chan) {
                let found = false;
                session.data.ConfbridgeChannels.forEach(function (existingChan) {
                    if (existingChan.id == chan.id) found = true;
                });
                if (!found) {
                    session.data.ConfbridgeChannels.push(chan);
                    session.data.ConfbridgeEvents.push({ event: chan.caller.name + ' (' + chan.caller.number + ') joined the conference', eventTime: utcDateNow() });
                    console.log('LEGO [spOnSessionReceivedMessage] ', chan.caller.name, 'Joined the conference. Muted: ', chan.muted);
                }
            });
        } else if (msgJson.type == 'ConfbridgeLeave') {
            msgJson.channels.forEach(function (chan) {
                session.data.ConfbridgeChannels.forEach(function (existingChan, i) {
                    if (existingChan.id == chan.id) {
                        session.data.ConfbridgeChannels.splice(i, 1);
                        console.log('LEGO [spOnSessionReceivedMessage] ', chan.caller.name, 'Left the conference');
                        session.data.ConfbridgeEvents.push({ event: chan.caller.name + ' (' + chan.caller.number + ') left the conference', eventTime: utcDateNow() });
                    }
                });
            });
        } else if (msgJson.type == 'ConfbridgeTalking') {
            console.log('LEGO [spOnSessionReceivedMessage] Handle video container - update ui (Someone is talking)');
        } else if (msgJson.type == 'ConfbridgeMute') {
            msgJson.channels.forEach(function (chan) {
                session.data.ConfbridgeChannels.forEach(function (existingChan) {
                    if (existingChan.id == chan.id) {
                        console.log('LEGO [spOnSessionReceivedMessage] ', existingChan.caller.name, 'is now muted');
                        existingChan.muted = true;
                    }
                });
            });
        } else if (msgJson.type == 'ConfbridgeUnmute') {
            msgJson.channels.forEach(function (chan) {
                session.data.ConfbridgeChannels.forEach(function (existingChan) {
                    if (existingChan.id == chan.id) {
                        console.log('LEGO [spOnSessionReceivedMessage]', existingChan.caller.name, 'is now unmuted');
                        existingChan.muted = false;
                    }
                });
            });
        } else if (msgJson.type == 'ConfbridgeEnd') {
            console.log('LEGO [spOnSessionReceivedMessage] The Asterisk Conference has ended, bye!');
        } else {
            console.log('LEGO [spOnSessionReceivedMessage] Unknown Asterisk Conference Event:', msgJson.type, msgJson);
        }
        response.accept();
    } else if (messageType.indexOf('application/x-myphone-confbridge-chat') > -1) {
        console.log('LEGO [spOnSessionReceivedMessage] x-myphone-confbridge-chat', response);
        response.accept();
    } else {
        console.log('LEGO [spOnSessionReceivedMessage] Unknown message type: ', response)
        response.reject();
    }
}
function spAudioCall(dialledNumber, extraHeaders) {
    if (userAgent == null || userAgent.isRegistered() == false) {
        return;
    }

    if (deviceInfo.microphoneFound == false) {
        return;
    }
    let supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
    let spdOptions = {
        earlyMedia: true,
        sessionDescriptionHandlerOptions: {
            constraints: {
                audio: {
                    deviceId: 'default',
                    autoGainControl: false,
                    echoCancellation: false,
                    noiseSuppression: false,
                    googAutoGainControl: false,
},
                video: false
            }
        }
    }
    // Configure Audio
    if (mic.deviceId != 'default') {
        let confirmedAudioDevice = false;
        let mics = deviceInfo.audioInputDevices;
        for (let i = 0; i < mics.length; ++i) {
            if (mic.deviceId == mics[i].deviceId) {
                confirmedAudioDevice = true;
                break;
            }
        }
        if (confirmedAudioDevice) {
            // @ts-ignore
            spdOptions.sessionDescriptionHandlerOptions.constraints.audio.deviceId = { exact: mic.deviceId }
        } else {
        }
    }
    if (supportedConstraints.autoGainControl) {
        // @ts-ignore
        spdOptions.sessionDescriptionHandlerOptions.constraints.audio.autoGainControl = false;
    }
    if (supportedConstraints.echoCancellation) {
        // @ts-ignore
        spdOptions.sessionDescriptionHandlerOptions.constraints.audio.echoCancellation = false;
    }
    if (supportedConstraints.noiseSuppression) {
        // @ts-ignore
        spdOptions.sessionDescriptionHandlerOptions.constraints.audio.noiseSuppression = false;
    }
    if (extraHeaders) {
        // @ts-ignore
        spdOptions.extraHeaders = extraHeaders;
    }
    //--  Invite
    let startTime = moment.utc();
    let targetURI = SIP.UserAgent.makeURI('sip:' + dialledNumber + '@' + 'testasterisk.thepublicgroup.com');
    SipSession = new SIP.Inviter(userAgent, targetURI, spdOptions);
    SipSession.data = {}
    SipSession.data.line = 1;
    SipSession.data.calldirection = 'outbound';
    SipSession.data.dst = dialledNumber;
    SipSession.data.callstart = startTime.format('YYYY-MM-DD HH:mm:ss UTC');
    SipSession.data.callTimer = {};
    SipSession.data.VideoSourceDevice = null;
    SipSession.data.AudioSourceDevice = mic.deviceId;
    SipSession.data.AudioOutputDevice = speaker.deviceId;
    SipSession.data.terminateby = 'them';
    SipSession.data.withvideo = false;
    SipSession.data.earlyReject = false;
    SipSession.isOnHold = false;
    SipSession.delegate = {
        onBye: function (sip) {
            spOnSessionReceivedBye(sip);
        },
        onMessage: function (sip) {
            //alert(sip)
            spOnSessionReceivedMessage(sip);
        },
        onInvite: function (sip) {
            spOnSessionReinvited(sip);
        },
        onSessionDescriptionHandler: function (sdh, provisional) {
            console.log('LEGO [spAudioCall] [onSessionDescriptionHandler] ', { sdh, provisional });
            spOnSessionDescriptionHandlerCreated(sdh, provisional, false);
        }
    }
    let inviterOptions = {
        requestDelegate: { // OutgoingRequestDelegate !!!
            onTrying: function (sip) {
                //alert(sip)
                console.log('LEGO [requestDelegate] [onTrying] ', sip);
            },
            onProgress: function (sip) {
                //alert(sip)
                console.log('LEGO [requestDelegate] [onProgress] ', sip);
                //_this.spOnInviteProgress(sip);
            },
            onRedirect: function (sip) {
                //alert(sip)
                console.log('LEGO [requestDelegate] [onRedirect] ', sip);
            },
            onAccept: function (sip) {
                //alert(sip)
                console.log('LEGO [requestDelegate] [onAccept] ', sip);
                spOnInviteAccepted(false, sip)
            },
            onReject: function (sip) {
                console.log('LEGO [requestDelegate] [onReject] ', sip);
                spOnInviteRejected(sip);
            }
        }
    }

    //console.log('LEGO [spAudioCall] execute invitation: ', inviterOptions);
    //this.spUpdateSip('session', this.sip['SipSession']);
    console.log(SipSession);
    return SipSession.invite(inviterOptions);
}
function spOnSessionReinvited(response) {
    console.log('LEGO [spOnSessionReinvited] Init ...', response);

    let session = SipSession;
    // This may be used to include video streams
    var sdp = response.body;

    // All the possible streams will get
    // Note, this will probably happen after the streams are added
    session.data.videoChannelNames = [];
    let videoSections = sdp.split('m=video');
    if (videoSections.length >= 1) {
        for (let m = 0; m < videoSections.length; m++) {
            if (videoSections[m].indexOf('a=mid:') > -1 && videoSections[m].indexOf('a=label:') > -1) {
                // We have a label for the media
                let lines = videoSections[m].split('\r\n');
                let channel = '';
                let mid = '';
                for (var i = 0; i < lines.length; i++) {
                    if (lines[i].indexOf('a=label:') == 0) {
                        channel = lines[i].replace('a=label:', '');
                    }
                    if (lines[i].indexOf('a=mid:') == 0) {
                        mid = lines[i].replace('a=mid:', '');
                    }
                }
                session.data.videoChannelNames.push({ 'mid': mid, 'channel': channel });
            }
        }
        console.log('LEGO [spOnSessionReinvited] videoChannelNames:', session.data.videoChannelNames);
    }
}
function spInitSoundMeter() {
    let session = SipSession;
    debugger;
    console.log('LEGO [spInitSoundMeter] Init ...', SIP);
    if (session) {
        console.log('LEGO [spInitSoundMeter] StartMonitoring ...');

        return StartLocalMonitoring(session).then(local => {
            localSoundMeter = local;
            return StartRemoteMonitoring(session);
        }).then(remote => {
            remoteSoundMeter = remote;
        });
    } else {
        return Promise.resolve();
    }
}
function spChangeLocalAudioInputDevice(newDevice) {
    // Stop Monitoringpossible
    let newId = newDevice.deviceId;
    let session = SipSession;
    if (session != null) { session.data.AudioSourceDevice = newId; } else { return; }
    let constraints = {
        audio: {
            deviceId: (newId != 'default') ? { exact: newId } : 'default',
            autoGainControl: false,
            echoCancellation: false,
            noiseSuppression: false,
            googAutoGainCont: false,
        },
        video: false
    };
    navigator.mediaDevices.getUserMedia(constraints).then(function (newStream) {
        // Assume that since we are selecting from a dropdown, this is possible
        let newMediaTrack = newStream.getAudioTracks()[0];
        let pc = session.sessionDescriptionHandler.peerConnection;
        pc.getSenders().forEach(function (RTCRtpSender) {
            if (RTCRtpSender.track && RTCRtpSender.track.kind == 'audio') {
                console.log('LEGO [changeLocalAudioInputDevice] Switching Audio Track : [' + RTCRtpSender.track.label + '] to [' + newMediaTrack.label + ']');
                RTCRtpSender.track.stop(); // Must stop, or this mic will stay in use
                RTCRtpSender.replaceTrack(newMediaTrack).then(function () {
                    RTCRtpSender.track.enabled = !session.data.ismute;

                    //-- Update store
                    console.log('LEGO [changeLocalAudioInputDevice] Changing Audio Track : [' + newDevice.deviceId + '][' + newDevice.label + ']');
                    mic = newDevice;
                    debugger;
                    var params = RTCRtpSender.getParameters();
                    params.encondigs[0].maxBitrate = 64000;
                    RTCRtpSender.setParameters(params);
                    //-- Update monitoring
                    StartLocalMonitoring(session).then(local => {
                    if (localSoundMeter) {
                        localSoundMeter.stop();
                        localSoundMeter = null;
                        localSoundMeter = local;
                        } else {
                            localSoundMeter = local;
                        }
                    });
                }).catch(function (e) {
                    console.log('LEGO [changeLocalAudioInputDevice] Error replacing track: ', newId, e);
                });
            }
        });
    }).catch(function (e) {
        console.log('LEGO [changeLocalAudioInputDevice] Error on getUserMedia: ', e);
    });
}
function spChangeLocalAudioOutputDevice(newDevice) {
    let newId = newDevice.deviceId;
    let session = SipSession;
    if (session == null) return;
    session.data.AudioOutputDevice = newId;
    let sinkId = newId;
    console.log('LEGO [spChangeLocalAudioOutputDevice] Attempting to set Audio Output SinkID  [' + sinkId + ']');

    // Remote Audio
    let element = $('#remote-audio').get(0);
    if (element) {
        if (typeof element.sinkId !== 'undefined') {
            element.setSinkId(sinkId).then(function () {
                console.log('LEGO [spChangeLocalAudioOutputDevice]  sinkId applied: ' + sinkId);
                speaker = newDevice;

                StartRemoteMonitoring(session).then(remote => {
                    if (remoteSoundMeter) {
                        remoteSoundMeter.stop().then(() => {
                            remoteSoundMeter = remote;
                        });
                    } else {
                        remoteSoundMeter = remote;
                    }
                });

            }).catch(function (e) {
                console.log('LEGO [spChangeLocalAudioOutputDevice]  Error using setSinkId: ', e);
            });
        } else {
            console.log('LEGO [spChangeLocalAudioOutputDevice] setSinkId() is not possible using this browser.')
        }
    }
}
async function spOnDeviceChange() {
    console.log('LEGO [spOnDeviceChange] Change Devices (a device was connected or disconnected)')
    await spCheckDevices().then((info) => {
        console.log('LEGO [spOnDeviceChange] Current Devices:', info)

        //-- Handle change of Mic (AudioInput Device)
        if (info.microphoneFound) {
            if (!info.audioDeviceFound) { // The device was removed - set the default device
                let trackToSet = deviceInfo.audioInputDevices[0];
                console.log('LEGO [spOnDeviceChange] Not found AudioInput - set with:', trackToSet)
                spChangeLocalAudioInputDevice(trackToSet);
            }
        } else {
            //-- Clean device data
            mic = null;
        }

        //-- Handle change of Speakers (AudioOutput Device)
        if (info.speakerFound) {
            // The device was removed - set the default device
            if (!info.speakerDeviceFound) {
                let trackToSet = deviceInfo.speakerDevices[0];
                console.log('LEGO [spOnDeviceChange] Not found Speaker - set with:', trackToSet)
                spChangeLocalAudioOutputDevice(trackToSet);
            }
        } else {
            //-- Clean device data
            speaker = null;
        }

        console.log('LEGO [spOnDeviceChange] OK !!!');
    }).catch(function (error) {
        console.log('LEGO [spOnDeviceChange] Error !!!', error);
    });
}
function spCleanCall() {
    if (navigator.mediaDevices.ondevicechange) {
        navigator.mediaDevices.ondevicechange = null;
    }
    navigator.mediaDevices.ondevicechange = spOnDeviceChange;

    //-- Sound meter
    localSoundMeter = null;
    remoteSoundMeter = null;

    //-- Clean Sip Agent
    userAgent = null;
    //-- Clean Local Tracks
    $('#call_container_audio').html('');
    //-- Clean Call Store
    //-- Clean local streams (Audio)
    spCleanLocalControls();
}
function spCleanLocalControls() {
    return new Promise((resolve) => {
        console.log('LEGO [cleanLocalControls] Init ...');
        try {
            // @ts-ignore
            if (window.SettingsMicrophoneStream) {
                // @ts-ignore
                let tracks = window.SettingsMicrophoneStream.getTracks();
                tracks.forEach(function (track) {
                    track.stop();
                });
            }
        } catch (e) {
            console.log('LEGO [cleanLocalControls] Error SettingsMicrophoneStream', e);
        }
        // @ts-ignore
        window.SettingsMicrophoneStream = null;
        try {
            // @ts-ignore
            if (window.SettingsMicrophoneSoundMeter) {
                // @ts-ignore
                window.SettingsMicrophoneSoundMeter.stop();
            }
        } catch (e) {
            console.log('LEGO [cleanLocalControls] Error SettingsMicrophoneSoundMeter', e)
        }
        // @ts-ignore
        window.SettingsMicrophoneSoundMeter = null;
        // Speaker Preview
        try {
            // @ts-ignore
            if (window.SettingsOutputAudio) {
                // @ts-ignore
                window.SettingsOutputAudio.pause();
            }
        } catch (e) {
            console.log('LEGO [cleanLocalControls] Error SettingsOutputAudio', e)
        }
        // @ts-ignore
        window.SettingsOutputAudio = null;
        try {
            // @ts-ignore
            if (window.SettingsOutputStream) {
                // @ts-ignore
                let tracks = window.SettingsOutputStream.getTracks();
                tracks.forEach(function (track) {
                    track.stop();
                });
            }
        } catch (e) {
            console.log('LEGO [cleanLocalControls] Error SettingsOutputStream', e);
        }
        // @ts-ignore
        window.SettingsOutputStream = null;
        try {
            // @ts-ignore
            if (window.SettingsOutputStreamMeter) {
                // @ts-ignore
                window.SettingsOutputStreamMeter.stop();
            }
        } catch (e) {
            console.log('LEGO [cleanLocalControls] Error SettingsOutputStream', e);
        }
        // @ts-ignore
        window.SettingsOutputStreamMeter = null;
        // Ringer Preview
        try {
            // @ts-ignore
            if (window.SettingsRingerAudio) {
                // @ts-ignore
                window.SettingsRingerAudio.pause();
            }
        } catch (e) {
            console.log('LEGO [cleanLocalControls] Error SettingsRingerAudio', e);
        }
        // @ts-ignore
        window.SettingsRingerAudio = null;
        try {
            // @ts-ignore
            if (window.SettingsRingerStream) {
                // @ts-ignore
                var tracks = window.SettingsRingerStream.getTracks();
                tracks.forEach(function (track) {
                    track.stop();
                });
            }
        } catch (e) {
            console.log('LEGO [cleanLocalControls] Error SettingsRingerStream', e);
        }
        // @ts-ignore
        window.SettingsRingerStream = null;
        try {
            // @ts-ignore
            if (window.SettingsRingerStreamMeter) {
                // @ts-ignore
                window.SettingsRingerStreamMeter.stop();
            }
        } catch (e) {
            console.log('LEGO [cleanLocalControls] Error SettingsRingerStreamMeter', e);
        }
        // @ts-ignore
        window.SettingsRingerStreamMeter = null;

        resolve('');
    });
}
function spMuteMic(mute) {
    debugger;
    console.log('LEGO [spMuteMic] mute status: ', mute);
    let isMute = !mute; //-- switch the value - false =disable & true = enable
    let session = SipSession;
    if (session == null) return;

    var pc = session.sessionDescriptionHandler.peerConnection;
    pc.getSenders().forEach(function (RTCRtpSender) {
        if (RTCRtpSender.track && RTCRtpSender.track.kind == 'audio') {
            if (RTCRtpSender.track.IsMixedTrack == true) {
                if (session.data.AudioSourceTrack && session.data.AudioSourceTrack.kind == 'audio') {
                    console.log('LEGO [spMuteMic] Muting Mixed Audio Track : ' + session.data.AudioSourceTrack.label);
                    session.data.AudioSourceTrack.enabled = isMute;
                }
            }
            console.log('LEGO [spMuteMic] Muting Audio Track : ' + RTCRtpSender.track.label, RTCRtpSender.track.IsMixedTrack);
            RTCRtpSender.track.enabled = isMute;
        }
    });

    if (!session.data.mute) session.data.mute = [];
    session.data.mute.push({ event: (mute ? 'mute' : 'unmute'), eventTime: moment().utc().format('YYYY-MM-DD HH:mm:ss UTC') });
    session.data.ismute = mute;
}
async function spUpdateLocalStateFromCache() {
    return new Promise((resolve) => {

        //-- Check mute
        // if(_this.classMembers){
        // let found : any = _this.classMembers.find(m => m.id === _this.currentUserId)
        // log.info('LEGO [spUpdateLocalStateFromCache] members: ', found, _this.meet.muted);
        // if (_this.meet.muted || found.muted){
        //     log.info('LEGO [spUpdateLocalStateFromCache] members: TRUE');
        //     _this.spMuteMic(true);
        // }else{
        //     log.info('LEGO [spUpdateLocalStateFromCache] members: FALSE');
        spMuteMic(false);
        //-- Check lock
        resolve('');
    });
}
function EndCallServer() {
    spEndCall().then(() => {
        spCleanCall();
        window.chrome.webview.postMessage("endCall");
    }).catch(function (e) {
        spTeardownSession();
    });
}

function changeMic(newDevice) {
    debugger;
    if (mic.deviceId === newDevice.deviceId) {
        return;
    }
    this.devAudio = newDevice.deviceId;
    spChangeLocalAudioInputDevice(newDevice);
}

function changeSpeaker(newDevice) {
    if (speaker.deviceId === newDevice.deviceId) {
        return;
    }
    this.devAudioOutput = newDevice.deviceId;
    spChangeLocalAudioOutputDevice(newDevice);
}
function spEndCall() {
    let session = SipSession;
    session.data.terminateby = 'us';
    session.data.reasonCode = 16;
    session.data.reasonText = 'Normal Call clearing';
    return session.bye().then(() => {
        spTeardownSession();
    });
}

function startTime() {
    interval = setInterval(() => {
        secs++;
        if (secs == 60) {
            secs = 0;
            mins++;
            if (mins == 60) {
                secs = 0;
                mins = 0;
                hors = hors + 1;
            }
        }
        var data = {
            'hour': hors,
            'mins': mins,
            'secs': secs
        };
        window.chrome.webview.postMessage(JSON.stringify(data));
    }, 1000);
}
async function initCall() {
    spCleanCall();
    await spInitMediaDevices();
    await spCreateUserAgent();

}



