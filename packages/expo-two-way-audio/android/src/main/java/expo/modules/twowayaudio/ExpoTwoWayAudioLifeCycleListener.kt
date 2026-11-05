package expo.modules.twowayaudio

import android.app.Activity
import expo.modules.core.interfaces.ReactActivityLifecycleListener

class ExpoTwoWayAudioLifeCycleListener : ReactActivityLifecycleListener {
    override fun onPause(activity: Activity?) {
        super.onPause(activity)
        val engine = ExpoTwoWayAudioModule.audioEngine ?: return
        if (!engine.keepsRecordingInBackground) engine.pauseRecordingAndPlayer()
    }

    override fun onResume(activity: Activity?) {
        super.onResume(activity)
        val engine = ExpoTwoWayAudioModule.audioEngine ?: return
        if (!engine.keepsRecordingInBackground) engine.resumeRecordingAndPlayer()
    }
}
