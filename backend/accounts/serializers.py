from django.contrib.auth.models import User
from rest_framework import serializers

from .models import UserProfile, AuditLog, Droit
from agents.models import SuperviseurGeneral


class DroitSerializer(serializers.ModelSerializer):
    class Meta:
        model = Droit
        fields = ["id", "code", "label", "description", "ordre"]


class UserListSerializer(serializers.ModelSerializer):
    role = serializers.CharField(source="profile.role", read_only=True)
    role_display = serializers.CharField(source="profile.get_role_display", read_only=True)
    must_change_password = serializers.BooleanField(source="profile.must_change_password", read_only=True)
    numero_telephone = serializers.CharField(source="profile.numero_telephone", read_only=True)
    permissions = serializers.SerializerMethodField()
    superviseur_code = serializers.SerializerMethodField()
    superviseur_id   = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name",
            "is_active", "role", "role_display", "must_change_password",
            "numero_telephone", "permissions", "superviseur_code", "superviseur_id",
        ]

    def get_permissions(self, obj):
        try:
            return list(obj.profile.droits.values_list("code", flat=True))
        except Exception:
            return []

    def get_superviseur_code(self, obj):
        try:
            return obj.superviseur_profile.code
        except Exception:
            return ""

    def get_superviseur_id(self, obj):
        try:
            return obj.superviseur_profile.id
        except Exception:
            return None


class CreateUserSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, min_length=6)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=UserProfile.ROLE_CHOICES)
    numero_telephone = serializers.CharField(max_length=20, required=False, allow_blank=True)

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Ce nom d'utilisateur existe déjà.")
        return value

    def create(self, validated_data):
        role = validated_data.pop("role")
        password = validated_data.pop("password")
        numero_telephone = validated_data.pop("numero_telephone", "")
        user = User.objects.create_user(password=password, **validated_data)
        UserProfile.objects.create(
            user=user,
            role=role,
            must_change_password=True,
            numero_telephone=numero_telephone,
        )
        if role == UserProfile.ROLE_SUPERVISEUR:
            SuperviseurGeneral.objects.create(
                user=user,
                nom=validated_data.get("last_name", "") or user.username,
                prenom=validated_data.get("first_name", ""),
                telephone=numero_telephone,
                actif=True,
            )
        return user


class ProfileSerializer(serializers.Serializer):
    """Modification du profil par l'utilisateur lui-même."""
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    numero_telephone = serializers.CharField(max_length=20, required=False, allow_blank=True)


class UpdateUserSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)
    role = serializers.ChoiceField(choices=UserProfile.ROLE_CHOICES, required=False)
    password = serializers.CharField(write_only=True, min_length=6, required=False, allow_blank=True)
    must_change_password = serializers.BooleanField(required=False)
    numero_telephone = serializers.CharField(max_length=20, required=False, allow_blank=True)

    def update(self, instance, validated_data):
        role = validated_data.pop("role", None)
        password = validated_data.pop("password", None)
        must_change_password = validated_data.pop("must_change_password", None)
        numero_telephone = validated_data.pop("numero_telephone", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if password:
            instance.set_password(password)

        instance.save()

        profile_dirty = any(v is not None for v in [role, must_change_password, numero_telephone])
        if profile_dirty:
            profile, _ = UserProfile.objects.get_or_create(user=instance)
            if role is not None:
                profile.role = role
            if must_change_password is not None:
                profile.must_change_password = must_change_password
            if numero_telephone is not None:
                profile.numero_telephone = numero_telephone
            profile.save()

        # Sync profil SuperviseurGeneral si le compte est superviseur
        effective_role = role or getattr(getattr(instance, "profile", None), "role", None)
        if effective_role == UserProfile.ROLE_SUPERVISEUR:
            sup, _ = SuperviseurGeneral.objects.get_or_create(user=instance, defaults={
                "nom": instance.last_name or instance.username,
                "prenom": instance.first_name,
            })
            sup.nom = instance.last_name or sup.nom
            sup.prenom = instance.first_name or sup.prenom
            if numero_telephone is not None:
                sup.telephone = numero_telephone
            sup.actif = instance.is_active
            sup.save()

        return instance


class AuditLogSerializer(serializers.ModelSerializer):
    utilisateur_username = serializers.CharField(source="utilisateur.username", read_only=True)

    class Meta:
        model = AuditLog
        fields = "__all__"
        read_only_fields = ("date_modification",)
