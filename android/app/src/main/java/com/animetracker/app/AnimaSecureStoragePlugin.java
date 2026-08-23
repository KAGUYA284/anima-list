package com.animetracker.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "AnimaSecureStorage")
public class AnimaSecureStoragePlugin extends Plugin {
    private static final String KEY_ALIAS = "anima_list_auth_token_v1";
    private static final String PREFS = "anima_list_secure_storage";
    private static final String TOKEN = "auth_token";

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private SecretKey secretKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(KEY_ALIAS)) return ((KeyStore.SecretKeyEntry) store.getEntry(KEY_ALIAS, null)).getSecretKey();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .build());
        return generator.generateKey();
    }

    @PluginMethod
    public void set(PluginCall call) {
        String value = call.getString("value");
        if (value == null || value.length() > 8192) { call.reject("Invalid token"); return; }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, secretKey());
            String encoded = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + "."
                + Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
            preferences().edit().putString(TOKEN, encoded).apply();
            call.resolve();
        } catch (Exception error) { call.reject("Secure storage unavailable", error); }
    }

    @PluginMethod
    public void get(PluginCall call) {
        String encoded = preferences().getString(TOKEN, null);
        JSObject result = new JSObject();
        if (encoded == null) { result.put("value", null); call.resolve(result); return; }
        try {
            String[] parts = encoded.split("\\.", 2);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
            result.put("value", new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8));
            call.resolve(result);
        } catch (Exception error) { call.reject("Secure storage unavailable", error); }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        preferences().edit().remove(TOKEN).apply();
        call.resolve();
    }
}
