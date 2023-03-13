var source;
var context;
var session;
class SoundMeter {
    constructor(sessionId) {
        context = null;
        let audioContext = null;
        try {
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            audioContext = new AudioContext();
        } catch (e) {
            console.log('LEGO [SoundMeter] AudioContext() LocalAudio not available... its fine.');
        }
        if (audioContext == null) return null;
        context = audioContext;
        source = null;

        this.sessionId = sessionId;

        this.captureInterval = null;
        this.levelsInterval = null;
        this.networkInterval = null;
        this.startTime = 0;

        this.ReceiveBitRateChart = null;
        this.ReceiveBitRate = [];
        this.ReceivePacketRateChart = null;
        this.ReceivePacketRate = [];
        this.ReceivePacketLossChart = null;
        this.ReceivePacketLoss = [];
        this.ReceiveJitterChart = null;
        this.ReceiveJitter = [];
        this.ReceiveLevelsChart = null;
        this.ReceiveLevels = [];
        this.SendBitRateChart = null;
        this.SendBitRate = [];
        this.SendPacketRateChart = null;
        this.SendPacketRate = [];

        this.instant = 0; // Primary Output indicator

        this.AnalyserNode = context.createAnalyser();
        this.AnalyserNode.minDecibels = -90;
        this.AnalyserNode.maxDecibels = -10;
        this.AnalyserNode.smoothingTimeConstant = 0.85;
    }
    connectToSource(stream, callback) {
        let _this = this;
        console.log('LEGO [SoundMeter]  connecting...', new Date());
        try {
            debugger;
            _this.source = context.createMediaStreamSource(stream);
            _this.source.connect(this.AnalyserNode);
            // this.AnalyserNode.connect(this.context.destination); // Can be left unconnected
            _this.start();

            callback(null);
        }
        catch (e) {
            console.log(e); // Probably not audio track
            callback(e);
        }
    }
    start() {
        let self = this;
        self.started = new Date();
        self.instant = 0;
        self.AnalyserNode.fftSize = 32; // 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, and 32768. Defaults to 2048
        self.dataArray = new Uint8Array(self.AnalyserNode.frequencyBinCount);

        this.captureInterval = window.setInterval(function () {
            self.AnalyserNode.getByteFrequencyData(self.dataArray); // Populate array with data from 0-255

            // Just take the maximum value of this data
            self.instant = 0;
            for (var d = 0; d < self.dataArray.length; d++) {
                if (self.dataArray[d] > self.instant) self.instant = self.dataArray[d];
            }
            //console.log('LEGO [SoundMeter] Start ...', self.instant, self.started);
        }, 1);
        console.log('LEGO [SoundMeter] Start ...');
    }
    stop() {
            let self = this;
            console.log('LEGO [SoundMeter] Disconnecting ...', self.captureInterval, self.levelsInterval, self.networkInterval);
            window.clearInterval(self.captureInterval);
            self.captureInterval = null;
            window.clearInterval(this.levelsInterval);
            self.levelsInterval = null;
            window.clearInterval(this.networkInterval);
            self.networkInterval = null;
            try {
                self.source.disconnect();
            } catch (e) {
                console.log('LEGO [SoundMeter] Error source.disconnect:', e)
            }
            self.source = null;
            try {
                self.AnalyserNode.disconnect();
            } catch (e) {
                console.log('LEGO [SoundMeter] Error AnalyserNode.disconnect:', e)
            }
            self.AnalyserNode = null;
            try {
                context.close();
            } catch (e) {
                console.log('LEGO [SoundMeter] Error context.close:', e)
            }
            self.context = null;;
    }
}

function StartLocalMonitoring(session) {
    return new Promise((resolve) => {
        debugger;
        session = session;
        console.log('LEGO [StartMonitoring] Init ... ');
        // Create local SoundMeter
        let soundMeter = new SoundMeter(session.id);
        if (soundMeter == null) {
            console.log('LEGO [StartMonitoring] AudioContext() LocalAudio not available... its fine.')
            return null;
        }

        // Ready the getStats request
        let localAudioStream = new MediaStream();
        let audioSender = null;
        let pc = session.sessionDescriptionHandler.peerConnection;
        pc.getSenders().forEach(function (RTCRtpSender) {
            if (RTCRtpSender.track && RTCRtpSender.track.kind == 'audio') {
                if (audioSender == null) {
                    console.log('LEGO [StartMonitoring] Adding Track to Monitor: ', RTCRtpSender.track.label);
                    localAudioStream.addTrack(RTCRtpSender.track);
                    audioSender = RTCRtpSender;
                } else {
                    console.log('LEGO [StartMonitoring] Found another Track, but audioSender not null');
                    console.log(RTCRtpSender);
                    console.log(RTCRtpSender.track);
                }
            }
        });

        // Setup Charts
        soundMeter.startTime = new Date();
        // Connect to Source
        soundMeter.connectToSource(localAudioStream, function (e) {
            if (e != null) return;
            console.log('LEGO [StartMonitoring] SoundMeter for LocalAudio Connected, displaying levels');
            soundMeter.levelsInterval = window.setInterval(function () {
                // Calculate Levels (0 - 255)
                let instPercent = (soundMeter.instant / 255) * 100;
                //window.chrome.webview.postMessage({ 'soundMeter': instPercent.toFixed(2) });
            }, 50);
        });
        resolve(soundMeter);
    });
}
 
function MeterSettingsOutput(audioStream, objectId, direction, interval){
    var soundMeter = new SoundMeter(null, null);
    soundMeter.startTime = Date.now();
    soundMeter.connectToSource(audioStream, function (e) {
        if (e != null) return;

        console.log('LEGO [MeterSettingsOutput] SoundMeter Connected, displaying levels to:'+ objectId);
        soundMeter.levelsInterval = window.setInterval(function () {
            // Calculate Levels (0 - 255)
            var instPercent = (soundMeter.instant / 255) * 100;

            //$('#'+ objectId).css(direction, instPercent.toFixed(2) +'%');
        }, interval);
    });

    return soundMeter;
}

function StartRemoteMonitoring(session) {
    return new Promise((resolve) => {
        console.log('LEGO [StartRemoteMonitoring] Creating RemoteAudio AudioContext on Line');
        debugger;
        // Create local SoundMeter
        let soundMeter = new SoundMeter(session.id);
        if(soundMeter == null){
            console.log('LEGO [StartRemoteMonitoring] AudioContext() RemoteAudio not available... it fine.');
            return null;
        }

        // Ready the getStats request
        let remoteAudioStream = new MediaStream();
        let audioReceiver = null;
        let pc = session.sessionDescriptionHandler.peerConnection;
        pc.getReceivers().forEach(function (RTCRtpReceiver) {
            if(RTCRtpReceiver.track && RTCRtpReceiver.track.kind == 'audio'){
                if(audioReceiver == null) {
                    remoteAudioStream.addTrack(RTCRtpReceiver.track);
                    audioReceiver = RTCRtpReceiver;
                }
                else {
                    console.log('LEGO [StartRemoteMonitoring] Found another Track, but audioReceiver not null');
                    console.log(RTCRtpReceiver);
                    console.log(RTCRtpReceiver.track);
                }
            }
        });

        // Setup Sound Metter
        soundMeter.startTime = Date.now();

        // Connect to Source
        soundMeter.connectToSource(remoteAudioStream, function (e) {
            if (e != null) return;

            // Create remote SoundMeter
            console.log('LEGO [StartRemoteMonitoring] SoundMeter for RemoteAudio Connected, displaying levels for Line');
            soundMeter.levelsInterval = window.setInterval(function () {
                // Calculate Levels (0 - 255)
                let instPercent = (soundMeter.instant/255) * 100;
                //window.chrome.webview.postMessage({ 'soundMeterSpeaker': instPercent.toFixed(2) });
            }, 50);
            soundMeter.networkInterval = null;
        });
        resolve(soundMeter);
    });
}