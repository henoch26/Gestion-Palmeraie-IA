from django.contrib.auth.models import User
from rest_framework import serializers

from .models import UserProfile, AuditLog


class UserListSerializer(serializers.ModelSerializer):
    role = serializers.CharField(source="profile.role", read_only=True)
    role_display = serializers.CharField(source="profile.get_role_display", read_only=True)
    must_change_password = serializers.BooleanField(source="profile.must_change_password", read_only=True)
    numero_telephone = serializers.CharField(source="profile.numero_telephone", read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name",
            "is_active", "role", "role_display", "must_change_password", "numero_telephone",
        ]


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

        return instance


class AuditLogSerializer(serializers.ModelSerializer):
    utilisateur_username = serializers.CharField(source="utilisateur.username", read_only=True)

    class Meta:
        model = AuditLog
        fields = "__all__"
        read_only_fields = ("date_modification",)
